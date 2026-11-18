import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_SERVICE,
  type ClassCancellationNoticeInput,
  type ClassCancellationNotifier,
  type NotificationService,
} from '@Common/contracts';
import { ClassNotFoundForNoticeError } from '@Notifications/errors';
import { ClassCancellationRepository } from '@Notifications/repositories';
import type { Prisma } from '@PrismaClient';
import { MESSAGE_MAX_LENGTH } from './notifications.service.js';

export const CLASS_CANCELLED_TITLE = 'Clase cancelada';

/** Zona del gimnasio: la fecha y hora del aviso se muestran en hora local. */
const GYM_TIME_ZONE = 'America/El_Salvador';

const dateFormat = new Intl.DateTimeFormat('es-SV', {
  timeZone: GYM_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat('es-SV', {
  timeZone: GYM_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** dd/mm/aaaa en la zona del gimnasio. */
export function formatClassDate(date: Date): string {
  const parts = dateFormat.formatToParts(date);
  return `${part(parts, 'day')}/${part(parts, 'month')}/${part(parts, 'year')}`;
}

/** hh:mm de 24 horas en la zona del gimnasio. */
export function formatClassTime(date: Date): string {
  const parts = timeFormat.formatToParts(date);
  return `${part(parts, 'hour')}:${part(parts, 'minute')}`;
}

/**
 * Mensaje de H27: "La clase {nombre} del {fecha} a las {hora} fue cancelada.
 * Motivo: {motivo}."
 *
 * El aviso admite 300 caracteres y, en el peor caso, un nombre de 60 más un
 * motivo de 200 se pasan; entonces el motivo se recorta con "…".
 */
export function buildClassCancelledMessage(
  name: string,
  startsAt: Date,
  reason: string,
): string {
  const head = `La clase ${name} del ${formatClassDate(startsAt)} a las ${formatClassTime(startsAt)} fue cancelada. Motivo: `;
  const cleanReason = reason.trim().replace(/[.\s]+$/, '');
  const room = MESSAGE_MAX_LENGTH - head.length - 1; // 1 por el punto final
  const fitted =
    cleanReason.length <= room
      ? cleanReason
      : `${cleanReason.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  return `${head}${fitted}.`;
}

/**
 * Aviso de clase cancelada (BE-27.1 / H27). Avisa por el servicio central
 * (H24) a cada miembro con reserva confirmada en la clase, dentro de la
 * transacción de H09.
 */
@Injectable()
export class ClassCancellationNoticesService implements ClassCancellationNotifier {
  constructor(
    private readonly repository: ClassCancellationRepository,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: NotificationService,
  ) {}

  /**
   * @returns cuántos avisos se crearon; 0 si nadie tenía reserva confirmada.
   * @throws {ClassNotFoundForNoticeError} si la clase no existe.
   */
  async notifyClassCancelled(
    input: ClassCancellationNoticeInput,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const gymClass = await this.repository.findClassWithConfirmedMembers(
      input.classId,
      tx,
    );
    if (!gymClass) throw new ClassNotFoundForNoticeError(input.classId);
    if (gymClass.memberIds.length === 0) return 0;

    return this.notifications.notify(
      {
        recipients: gymClass.memberIds,
        source: 'CLASSES',
        title: CLASS_CANCELLED_TITLE,
        message: buildClassCancelledMessage(
          gymClass.name,
          gymClass.startsAt,
          input.reason,
        ),
        referenceId: `class:${gymClass.id}`,
      },
      tx,
    );
  }
}
