import { BadRequestException, Injectable } from '@nestjs/common';
import {
  RatingsRepository,
  type ClassRatingRow,
  type TrainerRatingRow,
} from '@Reports/repositories';
import { reportRangeError } from './report-range.js';

export const NO_REVIEWS_MESSAGE = 'No hay reseñas en ese rango.';

export interface TrainerRatingSummary {
  trainerId: string;
  trainerName: string;
  averageRating: number;
  reviewCount: number;
}

export interface ClassRatingSummary {
  className: string;
  averageRating: number;
  reviewCount: number;
}

export interface RatingsReport {
  from: string;
  to: string;
  byTrainer: TrainerRatingSummary[];
  byClassName: ClassRatingSummary[];
  message: string | null;
}

const byName = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function compareNames(a: string, b: string): number {
  return byName.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Promedio con un decimal (p. ej. 4, 5, 4 -> 4.3). */
export function roundAverageRating(sum: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((sum * 10) / count) / 10;
}

/**
 * Construye el reporte ordenando de menor a mayor promedio y por nombre
 * alfabético en empates.
 */
export function buildRatingsReport(
  from: string,
  to: string,
  trainers: TrainerRatingRow[],
  classes: ClassRatingRow[],
): RatingsReport {
  const byTrainer: TrainerRatingSummary[] = trainers
    .map((row) => ({
      trainerId: row.trainerId,
      trainerName: row.trainerName,
      averageRating: roundAverageRating(row.ratingSum, row.reviewCount),
      reviewCount: row.reviewCount,
    }))
    .sort(
      (a, b) =>
        a.averageRating - b.averageRating ||
        compareNames(a.trainerName, b.trainerName) ||
        compareNames(a.trainerId, b.trainerId),
    );

  const byClassName: ClassRatingSummary[] = classes
    .map((row) => ({
      className: row.className,
      averageRating: roundAverageRating(row.ratingSum, row.reviewCount),
      reviewCount: row.reviewCount,
    }))
    .sort(
      (a, b) =>
        a.averageRating - b.averageRating ||
        compareNames(a.className, b.className),
    );

  const isEmpty = byTrainer.length === 0 && byClassName.length === 0;

  return {
    from,
    to,
    byTrainer,
    byClassName,
    message: isEmpty ? NO_REVIEWS_MESSAGE : null,
  };
}

/** Promedios de calificación por entrenador y nombre de clase (H23). Solo Administrador. */
@Injectable()
export class RatingsReportService {
  constructor(private readonly ratingsRepository: RatingsRepository) {}

  async getRatings(from: string, to: string): Promise<RatingsReport> {
    const problem = reportRangeError(from, to);
    if (problem) throw new BadRequestException(problem);

    const { trainers, classes } = await this.ratingsRepository.ratingsInRange(
      from,
      to,
    );
    return buildRatingsReport(from, to, trainers, classes);
  }
}
