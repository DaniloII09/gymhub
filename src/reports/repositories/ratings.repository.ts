import { Injectable } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { GYM_TIME_ZONE } from '@Payments/services';

export interface TrainerRatingRow {
  trainerId: string;
  trainerName: string;
  ratingSum: number;
  reviewCount: number;
}

export interface ClassRatingRow {
  className: string;
  ratingSum: number;
  reviewCount: number;
}

/**
 * Promedios de calificaciones de H23 (SCRUM-38 / BE-23.1).
 * Consulta reseñas creadas dentro del rango [from, to] en la zona horaria del
 * gimnasio, agregadas por entrenador (clases + sesiones) y por nombre de clase.
 */
@Injectable()
export class RatingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ratingsInRange(
    from: string,
    to: string,
  ): Promise<{ trainers: TrainerRatingRow[]; classes: ClassRatingRow[] }> {
    const createdLocal = Prisma.sql`timezone(${GYM_TIME_ZONE}, rv.created_at AT TIME ZONE 'UTC')::date`;

    const [trainers, classes] = await Promise.all([
      this.prisma.$queryRaw<TrainerRatingRow[]>`
        SELECT u.id AS "trainerId",
               u."fullName" AS "trainerName",
               SUM(rv.rating)::int AS "ratingSum",
               COUNT(*)::int AS "reviewCount"
          FROM reviews rv
          LEFT JOIN gym_classes gc ON gc.id = rv.gym_class_id
          LEFT JOIN personal_sessions ps ON ps.id = rv.personal_session_id
          JOIN users u ON u.id = COALESCE(gc.trainer_id, ps.trainer_id)
         WHERE ${createdLocal} BETWEEN ${from}::date AND ${to}::date
         GROUP BY u.id, u."fullName"`,
      this.prisma.$queryRaw<ClassRatingRow[]>`
        SELECT gc.name AS "className",
               SUM(rv.rating)::int AS "ratingSum",
               COUNT(*)::int AS "reviewCount"
          FROM reviews rv
          JOIN gym_classes gc ON gc.id = rv.gym_class_id
         WHERE ${createdLocal} BETWEEN ${from}::date AND ${to}::date
         GROUP BY gc.name`,
    ]);

    return { trainers, classes };
  }
}
