import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  AlreadyReservedError,
  ClassAlreadyStartedError,
  ClassFullError,
  ClassNotFoundError,
  ClassNotScheduledError,
} from '@Classes/errors';
import { Prisma, type ClassReservation, type ReservationStatus } from '@PrismaClient';
import type { GymClassWithDetails } from './class.repository.js';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const RESERVATION_TRANSACTION_TIMEOUT_MS = 10_000;

const WITH_TRAINER = {
  trainer: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} as const;

export type ClassReservationWithClass = ClassReservation & {
  gymClass: GymClassWithDetails;
};

/**
 * Único punto del módulo que escribe y consulta reservas en `class_reservations`.
 */
@Injectable()
export class ClassReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserva un cupo para un miembro en una clase programada.
   *
   * Bloquea la fila de la clase con `SELECT ... FOR UPDATE` antes de contar
   * las reservas confirmadas e insertar la nueva, evitando sobreventa bajo
   * alta concurrencia.
   *
   * @throws {ClassNotFoundError} si la clase no existe.
   * @throws {ClassNotScheduledError} si la clase está cancelada.
   * @throws {ClassAlreadyStartedError} si la clase ya inició.
   * @throws {AlreadyReservedError} si el miembro ya tiene una reserva CONFIRMED.
   * @throws {ClassFullError} si no quedan cupos disponibles.
   */
  async reserve(
    classId: number,
    memberId: string,
    now: Date = new Date(),
  ): Promise<ClassReservationWithClass> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<{ id: number }[]>`
            SELECT id FROM gym_classes WHERE id = ${classId} FOR UPDATE`;
          if (locked.length === 0) {
            throw new ClassNotFoundError(classId);
          }

          const gymClass = await tx.gymClass.findUniqueOrThrow({
            where: { id: classId },
            include: WITH_TRAINER,
          });

          if (gymClass.status !== 'SCHEDULED') {
            throw new ClassNotScheduledError(classId);
          }

          if (gymClass.startsAt.getTime() <= now.getTime()) {
            throw new ClassAlreadyStartedError(classId);
          }

          const existing = await tx.classReservation.findFirst({
            where: {
              classId,
              memberId,
              status: 'CONFIRMED',
            },
          });
          if (existing) {
            throw new AlreadyReservedError(classId, memberId);
          }

          const confirmed = await tx.classReservation.count({
            where: {
              classId,
              status: 'CONFIRMED',
            },
          });

          if (confirmed >= gymClass.capacity) {
            throw new ClassFullError(classId);
          }

          const created = await tx.classReservation.create({
            data: {
              classId,
              memberId,
              status: 'CONFIRMED',
            },
          });

          return {
            ...created,
            gymClass: {
              ...gymClass,
              confirmedReservations: confirmed + 1,
            },
          };
        },
        { timeout: RESERVATION_TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new AlreadyReservedError(classId, memberId);
      }
      throw error;
    }
  }

  /**
   * Lista las reservas del miembro autenticado, opcionalmente filtradas por
   * estado, ordenadas por fecha de inicio de la clase ascendente.
   */
  async findByMember(
    memberId: string,
    status?: ReservationStatus,
  ): Promise<ClassReservationWithClass[]> {
    const rows = await this.prisma.classReservation.findMany({
      where: {
        memberId,
        ...(status ? { status } : {}),
      },
      include: {
        gymClass: {
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
        },
      },
      orderBy: [{ gymClass: { startsAt: 'asc' } }, { id: 'asc' }],
    });

    return rows.map(({ gymClass: { _count, ...gymClass }, ...reservation }) => ({
      ...reservation,
      gymClass: {
        ...gymClass,
        confirmedReservations: _count.reservations,
      },
    }));
  }
}
