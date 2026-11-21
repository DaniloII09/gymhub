import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';
import {
  RoutineForbiddenError,
  RoutineMemberNotFoundError,
  RoutineNotFoundError,
} from '@Routines/errors';

export interface RoutineExerciseData {
  name: string;
  sets: number;
  reps: number;
  suggestedWeightKg: number;
}

export interface CreateRoutineData {
  name: string;
  trainerId: string;
  memberId: string;
  daysOfWeek: number[];
  exercises: RoutineExerciseData[];
}

export interface UpdateRoutineData {
  name?: string;
  memberId?: string;
  daysOfWeek?: number[];
  exercises?: RoutineExerciseData[];
}

export interface RoutineRecord {
  id: number;
  name: string;
  daysOfWeek: number[];
  trainer: { id: string; fullName: string };
  member: { id: string; fullName: string; memberCode: string | null };
  exercises: Array<{
    id: number;
    sortOrder: number;
    name: string;
    sets: number;
    reps: number;
    suggestedWeightKg: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ROUTINE_INCLUDE = {
  trainer: { select: { id: true, fullName: true } },
  member: { select: { id: true, fullName: true, memberCode: true } },
  exercises: { orderBy: { sortOrder: 'asc' as const } },
} as const;

type RoutineWithRelations = Prisma.RoutineGetPayload<{
  include: typeof ROUTINE_INCLUDE;
}>;

function toRecord(row: RoutineWithRelations): RoutineRecord {
  return {
    id: row.id,
    name: row.name,
    daysOfWeek: row.daysOfWeek,
    trainer: row.trainer,
    member: row.member,
    exercises: row.exercises.map((ex) => ({
      id: ex.id,
      sortOrder: ex.sortOrder,
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      suggestedWeightKg: Number(ex.suggestedWeightKg),
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeDays(days: number[]): number[] {
  return [...days].sort((a, b) => a - b);
}

/** Único punto del módulo que habla con las tablas `routines` y `routine_exercises`. */
@Injectable()
export class RoutineRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRoutineData): Promise<RoutineRecord> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveMember(tx, data.memberId);

      const created = await tx.routine.create({
        data: {
          name: data.name,
          trainerId: data.trainerId,
          memberId: data.memberId,
          daysOfWeek: normalizeDays(data.daysOfWeek),
          exercises: {
            create: data.exercises.map((ex, index) => ({
              sortOrder: index + 1,
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              suggestedWeightKg: ex.suggestedWeightKg,
            })),
          },
        },
        include: ROUTINE_INCLUDE,
      });

      return toRecord(created);
    });
  }

  async update(
    routineId: number,
    trainerId: string,
    data: UpdateRoutineData,
  ): Promise<RoutineRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.routine.findUnique({
        where: { id: routineId },
        select: { id: true, trainerId: true },
      });
      if (!existing) throw new RoutineNotFoundError();
      if (existing.trainerId !== trainerId) throw new RoutineForbiddenError();

      if (data.memberId !== undefined) {
        await this.assertActiveMember(tx, data.memberId);
      }

      if (data.exercises !== undefined) {
        await tx.routineExercise.deleteMany({ where: { routineId } });
      }

      const updated = await tx.routine.update({
        where: { id: routineId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.memberId !== undefined ? { memberId: data.memberId } : {}),
          ...(data.daysOfWeek !== undefined
            ? { daysOfWeek: normalizeDays(data.daysOfWeek) }
            : {}),
          ...(data.exercises !== undefined
            ? {
                exercises: {
                  create: data.exercises.map((ex, index) => ({
                    sortOrder: index + 1,
                    name: ex.name,
                    sets: ex.sets,
                    reps: ex.reps,
                    suggestedWeightKg: ex.suggestedWeightKg,
                  })),
                },
              }
            : {}),
        },
        include: ROUTINE_INCLUDE,
      });

      return toRecord(updated);
    });
  }

  async remove(routineId: number, trainerId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.routine.findUnique({
        where: { id: routineId },
        select: { id: true, trainerId: true },
      });
      if (!existing) throw new RoutineNotFoundError();
      if (existing.trainerId !== trainerId) throw new RoutineForbiddenError();

      await tx.routine.delete({ where: { id: routineId } });
    });
  }

  async findByMember(memberId: string): Promise<RoutineRecord[]> {
    const rows = await this.prisma.routine.findMany({
      where: { memberId },
      include: ROUTINE_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRecord);
  }

  async findByTrainer(trainerId: string): Promise<RoutineRecord[]> {
    const rows = await this.prisma.routine.findMany({
      where: { trainerId },
      include: ROUTINE_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRecord);
  }

  private async assertActiveMember(
    tx: Prisma.TransactionClient,
    memberId: string,
  ): Promise<void> {
    const count = await tx.user.count({
      where: { id: memberId, role: 'MEMBER', isActive: true },
    });
    if (count === 0) throw new RoutineMemberNotFoundError();
  }
}
