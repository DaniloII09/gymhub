import { BadRequestException } from '@nestjs/common';
import {
  buildRenewalRateReport,
  computeRenewalRate,
  NO_EXPIRED_MEMBERSHIPS_MESSAGE,
  RANGE_ORDER_MESSAGE,
  RANGE_TOO_LONG_MESSAGE,
  RenewalRateReportService,
} from '@Reports/services';
import type { RenewalRateRepository } from '@Reports/repositories';

describe('Reportes · buildRenewalRateReport (H30)', () => {
  it('calcula tasa con 1 decimal: 120 vencidas y 87 renovadas -> 72.5', () => {
    expect(computeRenewalRate(120, 87)).toBe(72.5);
    expect(computeRenewalRate(0, 0)).toBeNull();

    const report = buildRenewalRateReport('2026-09-01', '2026-11-30', [
      { month: '2026-09', expiredCount: 120, renewedCount: 87 },
      { month: '2026-11', expiredCount: 40, renewedCount: 20 },
    ]);

    expect(report.totals).toEqual({
      expiredCount: 160,
      renewedCount: 107,
      renewalRate: 66.9,
    });
    expect(report.months).toEqual([
      { month: '2026-09', expiredCount: 120, renewedCount: 87, renewalRate: 72.5 },
      { month: '2026-10', expiredCount: 0, renewedCount: 0, renewalRate: null },
      { month: '2026-11', expiredCount: 40, renewedCount: 20, renewalRate: 50 },
    ]);
    expect(report.message).toBeNull();
  });

  it('cuando no hay vencimientos en todo el rango devuelve tasas null y mensaje claro', () => {
    const report = buildRenewalRateReport('2026-09-01', '2026-10-31', []);
    expect(report).toEqual({
      from: '2026-09-01',
      to: '2026-10-31',
      totals: { expiredCount: 0, renewedCount: 0, renewalRate: null },
      months: [
        { month: '2026-09', expiredCount: 0, renewedCount: 0, renewalRate: null },
        { month: '2026-10', expiredCount: 0, renewedCount: 0, renewalRate: null },
      ],
      message: NO_EXPIRED_MEMBERSHIPS_MESSAGE,
    });
  });
});

describe('Reportes · RenewalRateReportService (H30)', () => {
  function build() {
    const renewalRateRepository = {
      renewalStatsByMonth: vi.fn().mockResolvedValue([]),
    };
    const service = new RenewalRateReportService(
      renewalRateRepository as unknown as RenewalRateRepository,
    );
    return { service, renewalRateRepository };
  }

  it('pasa la fecha local del gimnasio (El Salvador) al repositorio', async () => {
    const { service, renewalRateRepository } = build();
    // 20 nov 2026 02:00 UTC = 19 nov 2026 20:00 en El Salvador.
    await service.getRenewalRate(
      '2026-09-01',
      '2026-11-30',
      new Date('2026-11-20T02:00:00.000Z'),
    );
    expect(renewalRateRepository.renewalStatsByMonth).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-11-30',
      '2026-11-19',
    );
  });

  it.each([
    ['2026-11-30', '2026-09-01', RANGE_ORDER_MESSAGE],
    ['2026-01-01', '2027-01-01', RANGE_TOO_LONG_MESSAGE],
    ['2026-02-30', '2026-03-01', 'La fecha 2026-02-30 no existe.'],
  ])('rechaza %s..%s con 400 sin consultar BD', async (from, to, message) => {
    const { service, renewalRateRepository } = build();
    const err = await service.getRenewalRate(from, to).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe(message);
    expect(renewalRateRepository.renewalStatsByMonth).not.toHaveBeenCalled();
  });
});
