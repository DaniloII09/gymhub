import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  CapacityBelowConfirmedReservationsError,
  ClassNotFoundError,
  ClassNotScheduledError,
  InvalidTrainerRoleError,
  TrainerNotFoundError,
  TrainerScheduleConflictError,
} from '@Classes/errors';
import type { GymClass, Prisma } from '@PrismaClient';

export interface CreateGymClassData {
  name: string;
  trainerId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
}

export interface UpdateGymClassData {
  name?: string;
  trainerId?: string;
  startsAt?: Date;
  endsAt?: Date;
  capacity?: number;
}

const WITH_TRAINER = {
  trainer: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} as const;

export type GymClassWithTrainer = Prisma.GymClassGetPayload<{
  include: typeof WITH_TRAINER;
}>;

export type GymClassWithDetails = GymClassWithTrainer & {
  confirmedReservations: number;
};

/**
 * Único punto del módulo que accede a la tabla `gym_classes` y verifica el
 * entrenador en `users`.
 */
@Injectable()
export class ClassRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<GymClass | null> {
    return this.prisma.gymClass.findUnique({ where: { id } });
  }

  /**
   * Lista las clases dentro del rango `[from, to]` ordenadas por hora de inicio,
   * incluyendo datos del entrenador y el conteo real de reservas confirmadas.
   */
  async listByRange(from: Date, to: Date): Promise<GymClassWithDetails[]> {
    const classes = await this.prisma.gymClass.findMany({
      where: {
        startsAt: {
          gte: from,
          lte: to,
        },
      },
      include: {
        ...WITH_TRAINER,
        _count: {
          select: {
            reservations: {
              where: { status: 'CONFIRMED' },
            },
          },
        },
      },
      orderBy: { startsAt: 'asc' },
    });

    return classes.map(({ _count, ...item }) => ({
      ...item,
      confirmedReservations: _count.reservations,
    }));
  }

  /**
   * Crea una clase grupal en estado `SCHEDULED` verificando dentro de la misma
   * transacción que el usuario asignado exista, tenga rol `TRAINER` y no tenga
   * otra clase programada ni sesión personal que se cruce en el horario `[startsAt, endsAt)`.
   *
   * @throws {TrainerNotFoundError} si el usuario no existe.
   * @throws {InvalidTrainerRoleError} si el usuario no tiene rol `TRAINER` o está inactivo.
   * @throws {TrainerScheduleConflictError} si el entrenador ya tiene una clase o sesión personal en ese horario.
   */
  async create(data: CreateGymClassData): Promise<GymClassWithDetails> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertValidTrainer(tx, data.trainerId);
      await this.assertNoTrainerOverlap(tx, {
        trainerId: data.trainerId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
      });

      const created = await tx.gymClass.create({
        data: {
          name: data.name,
          trainerId: data.trainerId,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          capacity: data.capacity,
          status: 'SCHEDULED',
        },
        include: WITH_TRAINER,
      });

      return {
        ...created,
        confirmedReservations: 0,
      };
    });
  }

  /**
   * Actualiza una clase programada bloqueando su fila (`SELECT ... FOR UPDATE`)
   * para evitar condiciones de carrera al reducir el cupo o cambiar el horario.
   *
   * @throws {ClassNotFoundError} si la clase no existe.
   * @throws {ClassNotScheduledError} si la clase no está en estado `SCHEDULED`.
   * @throws {CapacityBelowConfirmedReservationsError} si el nuevo cupo es menor a las reservas confirmadas.
   * @throws {TrainerNotFoundError} si el nuevo entrenador no existe.
   * @throws {InvalidTrainerRoleError} si el usuario elegido no tiene rol `TRAINER`.
   * @throws {TrainerScheduleConflictError} si el horario se cruza con otra clase o sesión personal del entrenador.
   */
  async update(
    classId: number,
    data: UpdateGymClassData,
  ): Promise<GymClassWithDetails> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM gym_classes WHERE id = ${classId} FOR UPDATE`;
      if (locked.length === 0) {
        throw new ClassNotFoundError(classId);
      }

      const existing = await tx.gymClass.findUniqueOrThrow({
        where: { id: classId },
      });

      if (existing.status !== 'SCHEDULED') {
        throw new ClassNotScheduledError(classId);
      }

      const confirmedReservations = await this.countConfirmedReservations(
        classId,
        tx,
      );

      const nextCapacity = data.capacity ?? existing.capacity;
      if (nextCapacity < confirmedReservations) {
        throw new CapacityBelowConfirmedReservationsError(
          confirmedReservations,
        );
      }

      const nextTrainerId = data.trainerId ?? existing.trainerId;
      const nextStartsAt = data.startsAt ?? existing.startsAt;
      const nextEndsAt = data.endsAt ?? existing.endsAt;
      const nextName = data.name ?? existing.name;

      await this.assertValidTrainer(tx, nextTrainerId);
      await this.assertNoTrainerOverlap(tx, {
        trainerId: nextTrainerId,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        excludeClassId: classId,
      });

      const updated = await tx.gymClass.update({
        where: { id: classId },
        data: {
          name: nextName,
          trainerId: nextTrainerId,
          startsAt: nextStartsAt,
          endsAt: nextEndsAt,
          capacity: nextCapacity,
        },
        include: WITH_TRAINER,
      });

      return {
        ...updated,
        confirmedReservations,
      };
    });
  }

  /**
   * Cuenta las reservas confirmadas (`status = 'CONFIRMED'`) de la clase en
   * la tabla `class_reservations` (DB-7.1).
   */
  countConfirmedReservations(
    classId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.classReservation.count({
      where: {
        classId,
        status: 'CONFIRMED',
      },
    });
  }

  private async assertValidTrainer(
    tx: Prisma.TransactionClient,
    trainerId: string,
  ): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: trainerId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user) {
      throw new TrainerNotFoundError(trainerId);
    }

    if (user.role !== 'TRAINER' || !user.isActive) {
      throw new InvalidTrainerRoleError(trainerId);
    }
  }

  /**
   * Verifica que el entrenador no tenga otra clase grupal `SCHEDULED` ni una
   * sesión personal `SCHEDULED` que se cruce con `[startsAt, endsAt)`.
   *
   * Dos intervalos `[A_start, A_end)` y `[B_start, B_end)` se cruzan sí y solo
   * si `B_start < A_end` y `B_end > A_start`. Si una clase termina exactamente
   * cuando empieza la otra (`B_end == A_start` o `B_start == A_end`), NO hay cruce.
   */
  private async assertNoTrainerOverlap(
    tx: Prisma.TransactionClient,
    params: {
      trainerId: string;
      startsAt: Date;
      endsAt: Date;
      excludeClassId?: number;
    },
  ): Promise<void> {
    const conflictingClass = await tx.gymClass.findFirst({
      where: {
        ...(params.excludeClassId !== undefined
          ? { id: { not: params.excludeClassId } }
          : {}),
        trainerId: params.trainerId,
        status: 'SCHEDULED',
        startsAt: { lt: params.endsAt },
        endsAt: { gt: params.startsAt },
      },
      orderBy: { startsAt: 'asc' },
    });

    if (conflictingClass) {
      throw new TrainerScheduleConflictError({
        kind: 'CLASS',
        id: conflictingClass.id,
        name: conflictingClass.name,
        startsAt: conflictingClass.startsAt,
        endsAt: conflictingClass.endsAt,
      });
    }

    const conflictingSession = await tx.personalSession.findFirst({
      where: {
        trainerId: params.trainerId,
        status: 'SCHEDULED',
        startsAt: { lt: params.endsAt },
        endsAt: { gt: params.startsAt },
      },
      orderBy: { startsAt: 'asc' },
    });

    if (conflictingSession) {
      throw new TrainerScheduleConflictError({
        kind: 'PERSONAL_SESSION',
        id: conflictingSession.id,
        startsAt: conflictingSession.startsAt,
        endsAt: conflictingSession.endsAt,
      });
    }
  }
}

