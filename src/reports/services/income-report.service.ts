import { BadRequestException, Injectable } from '@nestjs/common';
import { IncomeRepository, type IncomeRow } from '@Reports/repositories';
import { monthsInRange, reportRangeError } from './report-range.js';

export const NO_PAYMENTS_MESSAGE = 'No hay pagos en ese rango.';

/** Ingresos separados por concepto. */
export interface IncomeBreakdown {
  /** Membresías (Mensual y Trimestral). */
  membership: number;
  /** Clases sueltas. */
  dropIn: number;
  /** Sesiones personales. */
  personalSession: number;
  total: number;
  /** Comprobantes que suman este total. */
  receiptCount: number;
}

export interface IncomeMonth extends IncomeBreakdown {
  /** YYYY-MM. */
  month: string;
}

export interface IncomeReport {
  from: string;
  to: string;
  totals: IncomeBreakdown;
  /** Todos los meses del rango, también los que no tuvieron pagos. */
  months: IncomeMonth[];
  /** "No hay pagos en ese rango." cuando no hubo comprobantes; si no, null. */
  message: string | null;
}

const FIELD_BY_TYPE: Record<
  IncomeRow['type'],
  'membership' | 'dropIn' | 'personalSession'
> = {
  MEMBERSHIP: 'membership',
  DROP_IN: 'dropIn',
  PERSONAL_SESSION: 'personalSession',
};

/** Mismo formato que IncomeBreakdown, en centavos: así las sumas no dejan decimales sueltos. */
type Cents = IncomeBreakdown;

const emptyCents = (): Cents => ({
  membership: 0,
  dropIn: 0,
  personalSession: 0,
  total: 0,
  receiptCount: 0,
});

const toDollars = (cents: Cents): IncomeBreakdown => ({
  membership: cents.membership / 100,
  dropIn: cents.dropIn / 100,
  personalSession: cents.personalSession / 100,
  total: cents.total / 100,
  receiptCount: cents.receiptCount,
});

/**
 * Arma el reporte con las sumas de la base. Incluye todos los meses del rango
 * con 0 en los que no hubo pagos, para que la tabla o la gráfica no salten
 * meses.
 */
export function buildIncomeReport(
  from: string,
  to: string,
  rows: IncomeRow[],
): IncomeReport {
  const byMonth = new Map(
    monthsInRange(from, to).map((month) => [month, emptyCents()]),
  );
  const totals = emptyCents();

  for (const row of rows) {
    const cents = Math.round(row.amount * 100);
    const field = FIELD_BY_TYPE[row.type];
    for (const bucket of [byMonth.get(row.month), totals]) {
      if (!bucket) continue;
      bucket[field] += cents;
      bucket.total += cents;
      bucket.receiptCount += row.receipts;
    }
  }

  return {
    from,
    to,
    totals: toDollars(totals),
    months: [...byMonth].map(([month, cents]) => ({
      month,
      ...toDollars(cents),
    })),
    message: totals.receiptCount === 0 ? NO_PAYMENTS_MESSAGE : null,
  };
}

/** Ingresos de un periodo (H29). Solo Administrador. */
@Injectable()
export class IncomeReportService {
  constructor(private readonly incomeRepository: IncomeRepository) {}

  async getIncome(from: string, to: string): Promise<IncomeReport> {
    const problem = reportRangeError(from, to);
    if (problem) throw new BadRequestException(problem);

    const rows = await this.incomeRepository.incomeByMonthAndType(from, to);
    return buildIncomeReport(from, to, rows);
  }
}
