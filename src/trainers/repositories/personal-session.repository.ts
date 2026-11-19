import { Inject, Injectable } from '@nestjs/common';
import { CHARGES_SERVICE, type ChargesService } from '@Common/contracts';
import { PrismaService } from '@Prisma/services';
import {
  InvalidTrainerRoleError,
  SessionSlotAlreadyTakenError,
  TrainerNotFoundError,
} from '@Trainers/errors';
import {
  Prisma,
  type ChargeStatus,
  type PersonalSession,
  type PersonalSessionStatus,
  type PersonalSessionOutcome,
} from '@PrismaClient';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const BOOKING_TRANSACTION_TIMEOUT_MS = 10_000;

export interface TrainerSummary {
  id: string;
  fullName: string;
  email: string;
}

export interface BookPersonalSessionData {
  trainerId: string;
  memberId: string;
  availabilityBlockId: string;
  startsAt: Date;
  endsAt: Date;
  price: number;
  concept: string;
  dueDate: Date;
}

export type PersonalSessionWithDetails = PersonalSession & {
  trainer: TrainerSummary;
  chargeStatus: ChargeStatus | null;
};

export type TrainerSessionWithDetails = PersonalSession & {
  member: { id: string; fullName: string; email: string };
  chargeStatus: ChargeStatus | null;
};

/**
 * Repositorio para consultar entrenadores activos, bloqueos/cruces de agenda,
 * configuración de tarifa y agendar sesiones personales en una transacción
 * atómica junto al cobro PENDING (DB-11.1 / BE-11.1 / BE-11.2).
 */
@Injectable()
export class PersonalSessionRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHARGES_SERVICE)
    private readonly chargesService: ChargesService,
  ) {}

  findActiveTrainers(): Promise<TrainerSummary[]> {
    return this.prisma.user.findMany({
      where: {
        role: 'TRAINER',
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
      },
      orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
    });
  }

  async findTrainerById(trainerId: string): Promise<{
    id: string;
    fullName: string;
    email: string;
    role: string;
    isActive: boolean;
  } | null> {
    return this.prisma.user.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  }

  async findScheduledConflictsForTrainer(
    trainerId: string,
    from: Date,
    to: Date,
  ): Promise<{
    sessions: Array<{ startsAt: Date; endsAt: Date }>;
    classes: Array<{ startsAt: Date; endsAt: Date }>;
  }> {
    const [sessions, classes] = await Promise.all([
      this.prisma.personalSession.findMany({
        where: {
          trainerId,
          status: 'SCHEDULED',
          startsAt: { lt: to },
          endsAt: { gt: from },
        },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.gymClass.findMany({
        where: {
          trainerId,
          status: 'SCHEDULED',
          startsAt: { lt: to },
          endsAt: { gt: from },
        },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    return { sessions, classes };
  }

  async getConfiguredDbPrice(): Promise<number | null> {
    const row = await this.prisma.personalSessionPricing.findUnique({
      where: { id: 1 },
      select: { price: true },
    });
    return row ? Number(row.price) : null;
  }

  async upsertDbPrice(price: number, updatedById: string): Promise<number> {
    const row = await this.prisma.personalSessionPricing.upsert({
      where: { id: 1 },
      update: { price, updatedById },
      create: { id: 1, price, updatedById },
      select: { price: true },
    });
    return Number(row.price);
  }

  /**
   * Reserva el espacio de 60 minutos bloqueando al entrenador (`SELECT ... FOR UPDATE`),
   * verificando solapamientos con sesiones `SCHEDULED` y clases grupales `SCHEDULED`,
   * generando el cobro `PENDING` mediante `CHARGES_SERVICE` e insertando la sesión
   * dentro de la misma transacción.
   *
   * @throws {TrainerNotFoundError} si el entrenador no existe.
   * @throws {InvalidTrainerRoleError} si no es TRAINER o está inactivo.
   * @throws {SessionSlotAlreadyTakenError} si existe cruce o reserva simultánea.
   */
  async book(
    data: BookPersonalSessionData,
  ): Promise<PersonalSessionWithDetails> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const lockedTrainers = await tx.$queryRaw<
            Array<{
              id: string;
              role: string;
              isActive: boolean;
              fullName: string;
              email: string;
            }>
          >`
            SELECT id, role, is_active AS "isActive", "fullName", email
            FROM users
            WHERE id = ${data.trainerId}::uuid
            FOR UPDATE`;

          if (lockedTrainers.length === 0) {
            throw new TrainerNotFoundError(data.trainerId);
          }

          const trainer = lockedTrainers[0];
          if (trainer.role !== 'TRAINER' || !trainer.isActive) {
            throw new InvalidTrainerRoleError(data.trainerId);
          }

          const conflictingSession = await tx.personalSession.findFirst({
            where: {
              trainerId: data.trainerId,
              status: 'SCHEDULED',
              startsAt: { lt: data.endsAt },
              endsAt: { gt: data.startsAt },
            },
            select: { id: true },
          });
          if (conflictingSession) {
            throw new SessionSlotAlreadyTakenError();
          }

          const conflictingClass = await tx.gymClass.findFirst({
            where: {
              trainerId: data.trainerId,
              status: 'SCHEDULED',
              startsAt: { lt: data.endsAt },
              endsAt: { gt: data.startsAt },
            },
            select: { id: true },
          });
          if (conflictingClass) {
            throw new SessionSlotAlreadyTakenError();
          }

          const { chargeId } = await this.chargesService.createPending(
            {
              memberId: data.memberId,
              type: 'PERSONAL_SESSION',
              concept: data.concept,
              amount: data.price,
              dueDate: data.dueDate,
            },
            tx,
          );

          const session = await tx.personalSession.create({
            data: {
              trainerId: data.trainerId,
              memberId: data.memberId,
              availabilityBlockId: data.availabilityBlockId,
              startsAt: data.startsAt,
              endsAt: data.endsAt,
              price: data.price,
              chargeId,
              status: 'SCHEDULED',
            },
          });

          return {
            ...session,
            trainer: {
              id: trainer.id,
              fullName: trainer.fullName,
              email: trainer.email,
            },
            chargeStatus: 'PENDING',
          };
        },
        { timeout: BOOKING_TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new SessionSlotAlreadyTakenError();
      }
      throw error;
    }
  }

  /**
   * Lista únicamente las sesiones del miembro autenticado con su cobro asociado.
   */
  async findByMember(
    memberId: string,
    status?: PersonalSessionStatus,
  ): Promise<PersonalSessionWithDetails[]> {
    const sessions = await this.prisma.personalSession.findMany({
      where: {
        memberId,
        ...(status ? { status } : {}),
      },
      include: {
        trainer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });

    const chargeIds = sessions
      .map((s) => s.chargeId)
      .filter((id): id is number => id !== null);

    const charges =
      chargeIds.length > 0
        ? await this.prisma.charge.findMany({
            where: { id: { in: chargeIds } },
            select: { id: true, status: true },
          })
        : [];

    const chargeStatusMap = new Map(charges.map((c) => [c.id, c.status]));

    return sessions.map((session) => ({
      ...session,
      chargeStatus:
        session.chargeId !== null
          ? (chargeStatusMap.get(session.chargeId) ?? null)
          : null,
    }));
  }

  async findUpcomingForTrainer(
    trainerId: string,
    from: Date,
    to: Date,
  ): Promise<TrainerSessionWithDetails[]> {
    const sessions = await this.prisma.personalSession.findMany({
      where: { trainerId, startsAt: { gte: from, lt: to }, status: { in: ['SCHEDULED', 'COMPLETED'] } },
      include: { member: { select: { id: true, fullName: true, email: true } } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    const chargeIds = sessions.map((item) => item.chargeId).filter((id): id is number => id !== null);
    const charges = chargeIds.length > 0
      ? await this.prisma.charge.findMany({ where: { id: { in: chargeIds } }, select: { id: true, status: true } })
      : [];
    const statusByCharge = new Map(charges.map((charge) => [charge.id, charge.status]));
    return sessions.map((session) => ({
      ...session,
      chargeStatus: session.chargeId !== null ? statusByCharge.get(session.chargeId) ?? null : null,
    }));
  }

  async markTrainerResult(
    sessionId: number,
    trainerId: string,
    outcome: PersonalSessionOutcome,
    now: Date,
  ): Promise<TrainerSessionWithDetails | 'NOT_FOUND' | 'INVALID_WINDOW'> {
    return this.prisma.$transaction(async (tx) => {
      const owned = await tx.personalSession.findFirst({
        where: { id: sessionId, trainerId },
        include: { member: { select: { id: true, fullName: true, email: true } } },
      });
      if (!owned) return 'NOT_FOUND';
      if (owned.status !== 'SCHEDULED' || owned.startsAt > now ||
          now.getTime() - owned.startsAt.getTime() > 24 * 60 * 60 * 1000) {
        return 'INVALID_WINDOW';
      }
      const changed = await tx.personalSession.updateMany({
        where: { id: sessionId, trainerId, status: 'SCHEDULED' },
        data: { status: 'COMPLETED', outcome, resultRecordedAt: now },
      });
      if (changed.count !== 1) return 'INVALID_WINDOW';
      const charge = owned.chargeId !== null
        ? await tx.charge.findUnique({ where: { id: owned.chargeId }, select: { status: true } })
        : null;
      return {
        ...owned,
        status: 'COMPLETED',
        outcome,
        resultRecordedAt: now,
        chargeStatus: charge?.status ?? null,
      };
    });
  }
}
