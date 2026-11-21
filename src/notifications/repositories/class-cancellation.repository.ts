import { Injectable } from '@nestjs/common';
import type { Prisma } from '@PrismaClient';

export interface CancelledClassForNotice {
  id: number;
  name: string;
  startsAt: Date;
  /** Miembros activos cuya reserva sigue confirmada. */
  memberIds: string[];
}

/**
 * Lectura que necesita H27: la clase y los miembros con reserva confirmada.
 * Lee con la transacción de H09 para ver el mismo estado que está cancelando.
 */
@Injectable()
export class ClassCancellationRepository {
  async findClassWithConfirmedMembers(
    classId: number,
    tx: Prisma.TransactionClient,
  ): Promise<CancelledClassForNotice | null> {
    const gymClass = await tx.gymClass.findUnique({
      where: { id: classId },
      select: {
        id: true,
        name: true,
        startsAt: true,
        reservations: {
          // Un miembro desactivado no puede recibir avisos y frenaría a los demás.
          where: { status: 'CONFIRMED', member: { isActive: true } },
          select: { memberId: true },
        },
      },
    });
    if (!gymClass) return null;
    return {
      id: gymClass.id,
      name: gymClass.name,
      startsAt: gymClass.startsAt,
      memberIds: gymClass.reservations.map((r) => r.memberId),
    };
  }
}
