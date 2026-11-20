import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

export interface RenewalMonthRow {
  month: string;
  expiredCount: number;
  renewedCount: number;
}

/**
 * Tasa de renovación de H30 (SCRUM-45 / BE-30.1).
 *
 * Cuenta membresías Mensuales y Trimestrales pagadas cuyo `end_date` cae en
 * `[from, to]` y ya vencieron (`end_date < today` en zona del gimnasio).
 * Excluye `DROP_IN`. Cada membresía vencida cuenta como renovada si existe al
 * menos una membresía Mensual/Trimestral pagada posterior del mismo miembro
 * cuyo `start_date` es `<= m.end_date + 7` días (`EXISTS` evita duplicados).
 */
@Injectable()
export class RenewalRateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async renewalStatsByMonth(
    from: string,
    to: string,
    today: string,
  ): Promise<RenewalMonthRow[]> {
    return this.prisma.$queryRaw<RenewalMonthRow[]>`
      SELECT to_char(m.end_date, 'YYYY-MM') AS month,
             COUNT(*)::int AS "expiredCount",
             COUNT(*) FILTER (
               WHERE EXISTS (
                 SELECT 1
                   FROM memberships r
                   LEFT JOIN charges rc ON rc.membership_id = r.id
                  WHERE r.member_id = m.member_id
                    AND r.id <> m.id
                    AND r.plan_type IN ('MONTHLY', 'QUARTERLY')
                    AND (
                      CASE
                        WHEN rc.id IS NOT NULL THEN rc.status = 'PAID'
                        ELSE r.status <> 'PENDING_PAYMENT'
                      END
                    )
                    AND (
                      r.start_date > m.start_date
                      OR (r.start_date = m.start_date AND r.end_date >= m.end_date AND r.id > m.id)
                    )
                    AND r.start_date <= (m.end_date + 7)
               )
             )::int AS "renewedCount"
        FROM memberships m
        LEFT JOIN charges mc ON mc.membership_id = m.id
       WHERE m.plan_type IN ('MONTHLY', 'QUARTERLY')
         AND m.end_date BETWEEN ${from}::date AND ${to}::date
         AND m.end_date < ${today}::date
         AND (
           CASE
             WHEN mc.id IS NOT NULL THEN mc.status = 'PAID'
             ELSE m.status <> 'PENDING_PAYMENT'
           END
         )
       GROUP BY 1
       ORDER BY 1`;
  }
}
