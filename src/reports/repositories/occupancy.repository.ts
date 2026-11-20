import { Injectable } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { GYM_TIME_ZONE } from '@Payments/services';

/** Clases de un mismo nombre sumadas en el rango. */
export interface OccupancyRow {
  name: string;
  /** Clases (sesiones) con ese nombre que cuentan para el reporte. */
  sessions: number;
  /** Suma del cupo máximo de esas clases. */
  capacity: number;
  /** Suma de sus reservas en estado Confirmada. */
  confirmed: number;
}

/**
 * Ocupación de H28. No tiene tablas propias: suma las clases grupales y sus
 * reservas (H06 y H07).
 */
@Injectable()
export class OccupancyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Suma por nombre de clase el cupo y las reservas confirmadas de las clases
   * que cuentan para el reporte:
   *
   * - no canceladas (status SCHEDULED),
   * - cuya hora de fin ya pasó,
   * - cuya fecha de inicio, en la zona del gimnasio, está entre `from` y `to`
   *   (YYYY-MM-DD, ambas incluidas).
   *
   * starts_at y ends_at se guardan en UTC sin zona: la fecha se convierte
   * primero a UTC y luego a la hora de El Salvador, y la hora de fin se
   * compara con la hora actual en UTC.
   */
  async occupancyByClassName(
    from: string,
    to: string,
  ): Promise<OccupancyRow[]> {
    const startsLocal = Prisma.sql`timezone(${GYM_TIME_ZONE}, g.starts_at AT TIME ZONE 'UTC')`;
    return this.prisma.$queryRaw<OccupancyRow[]>`
      SELECT g.name,
             COUNT(*)::int AS sessions,
             SUM(g.capacity)::int AS capacity,
             COALESCE(SUM(r.confirmed), 0)::int AS confirmed
        FROM gym_classes g
        LEFT JOIN (
              SELECT class_id, COUNT(*) AS confirmed
                FROM class_reservations
               WHERE status = 'CONFIRMED'
               GROUP BY class_id
             ) r ON r.class_id = g.id
       WHERE g.status = 'SCHEDULED'
         AND g.ends_at < timezone('UTC', now())
         AND ${startsLocal}::date BETWEEN ${from}::date AND ${to}::date
       GROUP BY g.name`;
  }
}
