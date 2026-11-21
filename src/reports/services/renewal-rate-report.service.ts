import { BadRequestException, Injectable } from '@nestjs/common';
import { gymToday } from '@Payments/services';
import {
  RenewalRateRepository,
  type RenewalMonthRow,
} from '@Reports/repositories';
import { monthsInRange, reportRangeError } from './report-range.js';

export const NO_EXPIRED_MEMBERSHIPS_MESSAGE =
  'No hay membresías vencidas en ese rango.';

export interface RenewalRateSummary {
  expiredCount: number;
  renewedCount: number;
  renewalRate: number | null;
}

export interface RenewalRateMonth extends RenewalRateSummary {
  month: string;
}

export interface RenewalRateReport {
  from: string;
  to: string;
  totals: RenewalRateSummary;
  months: RenewalRateMonth[];
  message: string | null;
}

/** Tasa renovadas / vencidas × 100 con un decimal; null si no hay vencimientos. */
export function computeRenewalRate(
  expiredCount: number,
  renewedCount: number,
): number | null {
  if (expiredCount <= 0) return null;
  return Math.round((renewedCount * 1000) / expiredCount) / 10;
}

/**
 * Arma el reporte mensual y total para el rango `[from, to]`.
 * Los meses sin vencimientos devuelven `renewalRate: null` (nunca `0`).
 */
export function buildRenewalRateReport(
  from: string,
  to: string,
  rows: RenewalMonthRow[],
): RenewalRateReport {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  let totalExpired = 0;
  let totalRenewed = 0;

  const months: RenewalRateMonth[] = monthsInRange(from, to).map((month) => {
    const row = byMonth.get(month);
    const expiredCount = row?.expiredCount ?? 0;
    const renewedCount = row?.renewedCount ?? 0;
    totalExpired += expiredCount;
    totalRenewed += renewedCount;
    return {
      month,
      expiredCount,
      renewedCount,
      renewalRate: computeRenewalRate(expiredCount, renewedCount),
    };
  });

  return {
    from,
    to,
    totals: {
      expiredCount: totalExpired,
      renewedCount: totalRenewed,
      renewalRate: computeRenewalRate(totalExpired, totalRenewed),
    },
    months,
    message: totalExpired === 0 ? NO_EXPIRED_MEMBERSHIPS_MESSAGE : null,
  };
}

/** Reporte de tasa de renovación de membresías (H30). Solo Administrador. */
@Injectable()
export class RenewalRateReportService {
  constructor(
    private readonly renewalRateRepository: RenewalRateRepository,
  ) {}

  async getRenewalRate(
    from: string,
    to: string,
    now: Date = new Date(),
  ): Promise<RenewalRateReport> {
    const problem = reportRangeError(from, to);
    if (problem) throw new BadRequestException(problem);

    const rows = await this.renewalRateRepository.renewalStatsByMonth(
      from,
      to,
      gymToday(now),
    );
    return buildRenewalRateReport(from, to, rows);
  }
}
