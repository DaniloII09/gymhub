import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateProgressEntryDto,
  ProgressDeltasDto,
  ProgressEvolutionResponseDto,
  UpdateProgressEntryDto,
} from '@Routines/dto';
import {
  DuplicateProgressDateError,
  ProgressEntryNotFoundError,
} from '@Routines/errors';
import {
  ProgressRepository,
  type StoredProgressEntry,
} from '@Routines/repositories';

export const GYM_TIME_ZONE = 'America/El_Salvador';
export const FUTURE_DATE_MESSAGE = 'La fecha no puede ser futura.';
export const EMPTY_PROGRESS_UPDATE_MESSAGE =
  'Envía al menos un campo para actualizar.';
const MAX_INT_ID = 2_147_483_647;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: GYM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function gymToday(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

export function isRealCalendarDate(date: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
    return false;
  }
  const [year, month, day] = date.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Construye la evolución cronológica con diferencias del último valor
 * respecto al primer registro (0 cuando solo hay un registro; null si no hay).
 */
export function buildProgressEvolution(
  entries: StoredProgressEntry[],
): ProgressEvolutionResponseDto {
  const normalized = entries.map((entry, index) => ({
    ...entry,
    isBaseline: index === 0,
  }));

  if (normalized.length === 0) {
    return { entries: [], deltas: null };
  }

  const baseline = normalized[0];
  const latest = normalized[normalized.length - 1];
  const deltas: ProgressDeltasDto = {
    weightKg: round2(latest.weightKg - baseline.weightKg),
    chestCm: round2(latest.chestCm - baseline.chestCm),
    waistCm: round2(latest.waistCm - baseline.waistCm),
    armCm: round2(latest.armCm - baseline.armCm),
  };

  return { entries: normalized, deltas };
}

/**
 * Progreso físico y evolución del miembro (H19 · BE-19.1, BE-19.2).
 */
@Injectable()
export class ProgressService {
  constructor(private readonly progressRepository: ProgressRepository) {}

  async create(
    memberId: string,
    dto: CreateProgressEntryDto,
    now: Date = new Date(),
  ): Promise<StoredProgressEntry> {
    this.assertValidPastOrTodayDate(dto.date, now);
    try {
      return await this.progressRepository.create({
        memberId,
        date: dto.date,
        weightKg: dto.weightKg,
        chestCm: dto.chestCm,
        waistCm: dto.waistCm,
        armCm: dto.armCm,
      });
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async updateMine(
    entryId: number,
    memberId: string,
    dto: UpdateProgressEntryDto,
    now: Date = new Date(),
  ): Promise<StoredProgressEntry> {
    if (!Number.isInteger(entryId) || entryId < 1 || entryId > MAX_INT_ID) {
      throw new NotFoundException(new ProgressEntryNotFoundError().message);
    }
    if (
      dto.date === undefined &&
      dto.weightKg === undefined &&
      dto.chestCm === undefined &&
      dto.waistCm === undefined &&
      dto.armCm === undefined
    ) {
      throw new BadRequestException(EMPTY_PROGRESS_UPDATE_MESSAGE);
    }
    if (dto.date !== undefined) {
      this.assertValidPastOrTodayDate(dto.date, now);
    }

    try {
      return await this.progressRepository.updateMine(entryId, memberId, dto);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async getEvolution(memberId: string): Promise<ProgressEvolutionResponseDto> {
    const entries = await this.progressRepository.findByMemberOrdered(memberId);
    return buildProgressEvolution(entries);
  }

  private assertValidPastOrTodayDate(date: string, now: Date): void {
    if (!isRealCalendarDate(date)) {
      throw new BadRequestException(`La fecha ${date} no existe.`);
    }
    if (date > gymToday(now)) {
      throw new BadRequestException(FUTURE_DATE_MESSAGE);
    }
  }

  private mapDomainError(error: unknown): unknown {
    if (error instanceof DuplicateProgressDateError) {
      return new ConflictException(error.message);
    }
    if (error instanceof ProgressEntryNotFoundError) {
      return new NotFoundException(error.message);
    }
    return error;
  }
}
