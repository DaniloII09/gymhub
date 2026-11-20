import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  CheckInMemberNotFoundError,
  ExceptionReasonRequiredError,
  RecentCheckInError,
} from '@CheckIns/errors';
import type { CheckIn } from '@PrismaClient';
import type { MembershipStatus } from '@Common/contracts';

/** Ventana en la que no se registra un segundo ingreso del mismo miembro. */
export const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

export interface RegisterCheckInData {
  memberId: string;
  /** Foto del estado de la membresía al momento del ingreso. */
  membershipStatus: MembershipStatus;
  registeredById: string;
  /** Hora del servidor. */
  now: Date;
  /**
   * H14: true si la membresía no está vigente. Entonces el ingreso exige
   * `exceptionReason` y se guarda como excepción.
   */
  requiresException: boolean;
  /** H14: motivo para dejar pasar a un miembro sin membresía vigente. */
  exceptionReason?: string;
}

export interface RegisteredCheckIn {
  checkIn: CheckIn;
  memberCode: string;
}

/** Único punto del módulo que habla con la tabla `check_ins`. */
@Injectable()
export class CheckInRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra el ingreso en una transacción. La fila del miembro se bloquea con
   * FOR UPDATE: dos registros simultáneos del mismo miembro se atienden de uno
   * en uno, así que el segundo ve al primero y no pasa la regla de 30 minutos.
   *
   * @throws {CheckInMemberNotFoundError} si no existe un miembro activo con ese id.
   * @throws {ExceptionReasonRequiredError} si la membresía no está vigente y falta el motivo (H14).
   * @throws {RecentCheckInError} si ya ingresó hace menos de 30 minutos.
   */
  async register(data: RegisterCheckInData): Promise<RegisteredCheckIn> {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.$queryRaw<{ id: string; memberCode: string | null }[]>`
        SELECT id, "memberCode" FROM users
        WHERE id = ${data.memberId}::uuid AND role = 'MEMBER' AND is_active
        FOR UPDATE`;
      if (member.length === 0) throw new CheckInMemberNotFoundError(data.memberId);
      if (data.requiresException && !data.exceptionReason) {
        throw new ExceptionReasonRequiredError(data.memberId);
      }

      const recent = await tx.checkIn.count({
        where: {
          memberId: data.memberId,
          checkedInAt: { gt: new Date(data.now.getTime() - DUPLICATE_WINDOW_MS) },
        },
      });
      if (recent > 0) throw new RecentCheckInError(data.memberId);

      const checkIn = await tx.checkIn.create({
        data: {
          memberId: data.memberId,
          checkedInAt: data.now,
          membershipStatus: data.membershipStatus,
          registeredById: data.registeredById,
          // H14: solo es excepción si la membresía no está vigente; con
          // membresía Activa el motivo no aplica y no se guarda.
          isException: data.requiresException,
          exceptionReason: data.requiresException ? data.exceptionReason : null,
        },
      });
      return { checkIn, memberCode: member[0].memberCode ?? '' };
    });
  }
}
