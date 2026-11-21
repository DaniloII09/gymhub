import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  MEMBERSHIP_EXPIRY_SOURCE,
  NOTIFICATION_SERVICE,
  type ExpiringMembership,
  type MembershipExpirySource,
  type NotificationService,
} from '@Common/contracts';
import { NotificationValidationError } from '@Notifications/errors';
import { PrismaService } from '@Prisma/services';
import type { ExpiryNoticeKind } from '@PrismaClient';

export const EXPIRY_NOTICE_TITLE = 'Tu membresía vence pronto';

/** Zona del gimnasio: "hoy" y las fechas del aviso son de El Salvador. */
export const GYM_TIME_ZONE = 'America/El_Salvador';

/** Avisos de H26: 5 días antes y 1 día antes del vencimiento. */
export const EXPIRY_NOTICE_DAYS: Record<ExpiryNoticeKind, number> = {
  D5: 5,
  D1: 1,
};

export interface ExpiryNoticesRun {
  /** Fecha del gimnasio en que corrió la tarea (AAAA-MM-DD). */
  date: string;
  /** Avisos nuevos enviados, por tipo. */
  sent: Record<ExpiryNoticeKind, number>;
  /** false si Membresías (H04) todavía no registra MEMBERSHIP_EXPIRY_SOURCE. */
  sourceAvailable: boolean;
}

/** Fecha de hoy (AAAA-MM-DD) en la zona del gimnasio. */
export function gymToday(now: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: GYM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Suma días a una fecha AAAA-MM-DD sin pasar por la hora local. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-12-15" -> "15/12/2026". */
export function formatGymDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function buildExpiryMessage(
  kind: ExpiryNoticeKind,
  planName: string,
  endDate: string,
): string {
  const when = kind === 'D1' ? 'mañana' : 'en 5 días';
  return (
    `Tu membresía ${planName} vence ${when}, el ${formatGymDate(endDate)}. ` +
    'Renuévala en recepción o desde Mis pagos.'
  );
}

/** Clase suelta y membresías ya renovadas no reciben aviso (H26). */
export function needsNotice(membership: ExpiringMembership): boolean {
  return membership.planType !== 'DROP_IN' && !membership.renewed;
}

/**
 * Avisos de vencimiento (BE-26.1 / H26). La tarea diaria de las 07:00 llama a
 * `runFor(hoy)`: busca las membresías que vencen en 5 días y en 1 día y avisa
 * a cada miembro con el servicio central de avisos (H24).
 *
 * Cada aviso se registra en `expiry_notices`, cuya restricción única
 * (membresía, tipo) garantiza que la tarea pueda correr dos veces el mismo día
 * sin repetir avisos. El registro y el aviso van en la misma transacción.
 */
@Injectable()
export class ExpiryNoticesService {
  private readonly logger = new Logger(ExpiryNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: NotificationService,
  ) {}

  async runFor(today: string = gymToday()): Promise<ExpiryNoticesRun> {
    const sent: Record<ExpiryNoticeKind, number> = { D5: 0, D1: 0 };
    const source = this.findSource();
    if (!source) {
      this.logger.warn(
        'MEMBERSHIP_EXPIRY_SOURCE no está registrado (H04): no se enviaron avisos de vencimiento.',
      );
      return { date: today, sent, sourceAvailable: false };
    }

    for (const kind of Object.keys(EXPIRY_NOTICE_DAYS) as ExpiryNoticeKind[]) {
      const endDate = addDays(today, EXPIRY_NOTICE_DAYS[kind]);
      const memberships = await source.expiringOn(endDate);
      for (const membership of memberships.filter(needsNotice)) {
        if (await this.notifyOnce(kind, endDate, membership)) sent[kind] += 1;
      }
    }

    this.logger.log(
      `Avisos de vencimiento del ${today}: ${sent.D5} D5 y ${sent.D1} D1.`,
    );
    return { date: today, sent, sourceAvailable: true };
  }

  /** Devuelve true si envió el aviso, false si ya se había enviado. */
  private async notifyOnce(
    kind: ExpiryNoticeKind,
    endDate: string,
    membership: ExpiringMembership,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // ON CONFLICT DO NOTHING: si ya existe (membresía, tipo), no inserta.
        const { count } = await tx.expiryNotice.createMany({
          data: {
            membershipId: membership.membershipId,
            memberId: membership.memberId,
            kind,
            endDate: new Date(`${endDate}T00:00:00.000Z`),
          },
          skipDuplicates: true,
        });
        if (count === 0) return false;

        await this.notifications.notify(
          {
            recipients: [membership.memberId],
            source: 'MEMBERSHIPS',
            title: EXPIRY_NOTICE_TITLE,
            message: buildExpiryMessage(kind, membership.planName, endDate),
            referenceId: `membership:${membership.membershipId}`,
          },
          tx,
        );
        return true;
      });
    } catch (error) {
      // Un miembro inactivo o con datos inválidos no detiene a los demás.
      if (error instanceof NotificationValidationError) {
        this.logger.warn(
          `No se avisó la membresía ${membership.membershipId}: ${error.message}`,
        );
        return false;
      }
      throw error;
    }
  }

  private findSource(): MembershipExpirySource | null {
    try {
      return this.moduleRef.get<MembershipExpirySource>(
        MEMBERSHIP_EXPIRY_SOURCE,
        { strict: false },
      );
    } catch {
      // ModuleRef lanza si ningún módulo provee el token.
      return null;
    }
  }
}
