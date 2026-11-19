import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { CheckInMemberNotFoundError, RecentCheckInError } from '@CheckIns/errors';
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
   * @throws {RecentCheckInError} si ya ingresó hace menos de 30 minutos.
   */
  async register(data: RegisterCheckInData): Promise<RegisteredCheckIn> {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.$queryRaw<{ id: string; memberCode: string | null }[]>`
        SELECT id, "memberCode" FROM users
        WHERE id = ${data.memberId}::uuid AND role = 'MEMBER' AND is_active
        FOR UPDATE`;
      if (member.length === 0) throw new CheckInMemberNotFoundError(data.memberId);

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
        },
      });
      return { checkIn, memberCode: member[0].memberCode ?? '' };
    });
  }
}
