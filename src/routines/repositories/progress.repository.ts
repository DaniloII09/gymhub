import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma, type ProgressEntry } from '@PrismaClient';
import {
  DuplicateProgressDateError,
  ProgressEntryNotFoundError,
} from '@Routines/errors';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export interface CreateProgressData {
  memberId: string;
  date: string;
  weightKg: number;
  chestCm: number;
  waistCm: number;
  armCm: number;
}

export interface UpdateProgressData {
  date?: string;
  weightKg?: number;
  chestCm?: number;
  waistCm?: number;
  armCm?: number;
}

export interface StoredProgressEntry {
  id: number;
  date: string;
  weightKg: number;
  chestCm: number;
  waistCm: number;
  armCm: number;
  isBaseline: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toStoredEntry(
  row: ProgressEntry,
  isBaseline: boolean,
): StoredProgressEntry {
  return {
    id: row.id,
    date: fromDbDate(row.recordedAt),
    weightKg: Number(row.weightKg),
    chestCm: Number(row.chestCm),
    waistCm: Number(row.waistCm),
    armCm: Number(row.armCm),
    isBaseline,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Único punto del módulo que habla con la tabla `progress_entries`. */
@Injectable()
export class ProgressRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateProgressData): Promise<StoredProgressEntry> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.progressEntry.create({
          data: {
            memberId: data.memberId,
            recordedAt: toDbDate(data.date),
            weightKg: data.weightKg,
            chestCm: data.chestCm,
            waistCm: data.waistCm,
            armCm: data.armCm,
          },
        });

        const earliest = await tx.progressEntry.findFirst({
          where: { memberId: data.memberId },
          orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        return toStoredEntry(created, earliest?.id === created.id);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new DuplicateProgressDateError();
      }
      throw error;
    }
  }

  async updateMine(
    entryId: number,
    memberId: string,
    data: UpdateProgressData,
  ): Promise<StoredProgressEntry> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.progressEntry.findFirst({
          where: { id: entryId, memberId },
          select: { id: true },
        });
        if (!existing) throw new ProgressEntryNotFoundError();

        const updated = await tx.progressEntry.update({
          where: { id: entryId },
          data: {
            ...(data.date !== undefined ? { recordedAt: toDbDate(data.date) } : {}),
            ...(data.weightKg !== undefined ? { weightKg: data.weightKg } : {}),
            ...(data.chestCm !== undefined ? { chestCm: data.chestCm } : {}),
            ...(data.waistCm !== undefined ? { waistCm: data.waistCm } : {}),
            ...(data.armCm !== undefined ? { armCm: data.armCm } : {}),
          },
        });

        const earliest = await tx.progressEntry.findFirst({
          where: { memberId },
          orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        return toStoredEntry(updated, earliest?.id === updated.id);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new DuplicateProgressDateError();
      }
      throw error;
    }
  }

  async findByMemberOrdered(memberId: string): Promise<StoredProgressEntry[]> {
    const rows = await this.prisma.progressEntry.findMany({
      where: { memberId },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row, index) => toStoredEntry(row, index === 0));
  }
}
