import { BadRequestException } from '@nestjs/common';
import {
  addMonths,
  buildIncomeReport,
  IncomeReportService,
  isRealDate,
  monthsInRange,
  NO_PAYMENTS_MESSAGE,
  RANGE_ORDER_MESSAGE,
  RANGE_TOO_LONG_MESSAGE,
  REPORT_DATE_FORMAT_MESSAGE,
  reportRangeError,
} from '@Reports/services';
import type { IncomeRepository, IncomeRow } from '@Reports/repositories';

describe('Reportes · rango de fechas (H28 y H29)', () => {
  it('reconoce las fechas que existen y rechaza las que no', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2026-04-31')).toBe(false);
    expect(isRealDate('26-04-01')).toBe(false);
  });

  it('suma meses usando el último día del mes cuando el día no existe', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-19', 12)).toBe('2027-11-19');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('acepta hasta 12 meses y rechaza un día más', () => {
    expect(reportRangeError('2026-01-01', '2026-12-31')).toBeNull();
    expect(reportRangeError('2025-11-20', '2026-11-19')).toBeNull();
    expect(reportRangeError('2026-11-19', '2026-11-19')).toBeNull();
    expect(reportRangeError('2026-01-01', '2027-01-01')).toBe(
      RANGE_TOO_LONG_MESSAGE,
    );
    expect(reportRangeError('2025-11-20', '2026-11-20')).toBe(
      RANGE_TOO_LONG_MESSAGE,
    );
  });

  it('rechaza un inicio posterior al fin, otro formato y fechas inexistentes', () => {
    expect(reportRangeError('2026-11-20', '2026-11-19')).toBe(
      RANGE_ORDER_MESSAGE,
    );
    expect(reportRangeError('2026/11/01', '2026-11-19')).toBe(
      REPORT_DATE_FORMAT_MESSAGE,
    );
    expect(reportRangeError('2026-02-30', '2026-03-10')).toBe(
      'La fecha 2026-02-30 no existe.',
    );
  });

  it('lista los meses del rango, también cruzando de año', () => {
    expect(monthsInRange('2026-11-19', '2027-02-01')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(monthsInRange('2026-11-01', '2026-11-30')).toEqual(['2026-11']);
    expect(monthsInRange('2025-11-20', '2026-11-19')).toHaveLength(13);
  });
});

const ROWS: IncomeRow[] = [
  { month: '2026-09', type: 'MEMBERSHIP', amount: 25, receipts: 1 },
  { month: '2026-09', type: 'DROP_IN', amount: 5, receipts: 1 },
  { month: '2026-11', type: 'MEMBERSHIP', amount: 85, receipts: 2 },
  { month: '2026-11', type: 'DROP_IN', amount: 5.1, receipts: 1 },
  { month: '2026-11', type: 'PERSONAL_SESSION', amount: 30.2, receipts: 2 },
];

describe('Reportes · buildIncomeReport (H29)', () => {
  it('separa los ingresos por concepto y suma el total del periodo', () => {
    const report = buildIncomeReport('2026-09-01', '2026-11-30', ROWS);
    expect(report.totals).toEqual({
      membership: 110,
      dropIn: 10.1,
      personalSession: 30.2,
      total: 150.3,
      receiptCount: 7,
    });
    expect(report.message).toBeNull();
  });

  it('incluye todos los meses en orden, con 0 en los que no hubo pagos', () => {
    const report = buildIncomeReport('2026-09-01', '2026-11-30', ROWS);
    expect(report.months.map((m) => m.month)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(report.months[0]).toEqual({
      month: '2026-09',
      membership: 25,
      dropIn: 5,
      personalSession: 0,
      total: 30,
      receiptCount: 2,
    });
    expect(report.months[1]).toMatchObject({ total: 0, receiptCount: 0 });
    expect(report.months[2]).toMatchObject({ total: 120.3, receiptCount: 5 });
  });

  it('la suma de los meses es igual al total del periodo', () => {
    const report = buildIncomeReport('2026-09-01', '2026-11-30', ROWS);
    const cents = report.months.reduce(
      (sum, m) => sum + Math.round(m.total * 100),
      0,
    );
    expect(cents / 100).toBe(report.totals.total);
  });

  it('sin pagos devuelve $0.00 y "No hay pagos en ese rango."', () => {
    const report = buildIncomeReport('2026-10-01', '2026-10-31', []);
    expect(report.totals).toEqual({
      membership: 0,
      dropIn: 0,
      personalSession: 0,
      total: 0,
      receiptCount: 0,
    });
    expect(report.months).toEqual([
      {
        month: '2026-10',
        membership: 0,
        dropIn: 0,
        personalSession: 0,
        total: 0,
        receiptCount: 0,
      },
    ]);
    expect(report.message).toBe(NO_PAYMENTS_MESSAGE);
  });
});

describe('Reportes · IncomeReportService (H29)', () => {
  function build(rows: IncomeRow[] = ROWS) {
    const incomeRepository = {
      incomeByMonthAndType: vi.fn().mockResolvedValue(rows),
    };
    const service = new IncomeReportService(
      incomeRepository as unknown as IncomeRepository,
    );
    return { service, incomeRepository };
  }

  it('consulta el rango pedido y arma el reporte', async () => {
    const { service, incomeRepository } = build();
    const report = await service.getIncome('2026-09-01', '2026-11-30');
    expect(incomeRepository.incomeByMonthAndType).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-11-30',
    );
    expect(report.totals.total).toBe(150.3);
  });

  it.each([
    ['2026-11-30', '2026-09-01', RANGE_ORDER_MESSAGE],
    ['2026-01-01', '2027-01-01', RANGE_TOO_LONG_MESSAGE],
    ['2026-02-30', '2026-03-01', 'La fecha 2026-02-30 no existe.'],
  ])(
    'con %s a %s responde 400 sin consultar la base',
    async (from, to, message) => {
      const { service, incomeRepository } = build();
      const error = await service.getIncome(from, to).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(message);
      expect(incomeRepository.incomeByMonthAndType).not.toHaveBeenCalled();
    },
  );
});
