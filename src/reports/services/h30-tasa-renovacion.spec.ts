import { BadRequestException } from '@nestjs/common';
import { RenewalRateReportController } from '@Reports/controllers';
import { RenewalRateRepository } from '@Reports/repositories';
import { RenewalRateReportService } from '@Reports/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';
import { captureQueryRaw } from '../../../test/helpers/sql-capture.js';

// 19 nov 2026 a mediodía en El Salvador.
const NOW = new Date('2026-11-19T18:00:00.000Z');

function fixture(rows: object[]) {
  const raw = captureQueryRaw([rows]);
  const service = new RenewalRateReportService(
    new RenewalRateRepository({ $queryRaw: raw.fn } as never),
  );
  return { queries: raw.queries, service };
}

describe('H30. Ver la tasa de renovación de membresías', () => {
  it('AC1: tasa del rango con un decimal y desglose por mes', async () => {
    const { service } = fixture([
      { month: '2026-09', expiredCount: 3, renewedCount: 2 },
      { month: '2026-10', expiredCount: 4, renewedCount: 1 },
    ]);
    const report = await service.getRenewalRate(
      '2026-09-01',
      '2026-11-18',
      NOW,
    );

    expect(report.totals).toEqual({
      expiredCount: 7,
      renewedCount: 3,
      renewalRate: 42.9,
    });
    expect(report.months).toEqual([
      { month: '2026-09', expiredCount: 3, renewedCount: 2, renewalRate: 66.7 },
      { month: '2026-10', expiredCount: 4, renewedCount: 1, renewalRate: 25 },
      { month: '2026-11', expiredCount: 0, renewedCount: 0, renewalRate: null },
    ]);
  });

  it('AC2: cuenta como renovada si hay una nueva membresía pagada que inicia hasta 7 días después del vencimiento', async () => {
    const { service, queries } = fixture([
      { month: '2026-10', expiredCount: 2, renewedCount: 1 },
    ]);
    const report = await service.getRenewalRate(
      '2026-10-01',
      '2026-10-31',
      NOW,
    );

    const { sql, values } = queries[0];
    // Vencidas del rango que ya pasaron, pagadas.
    expect(sql).toContain('m.end_date BETWEEN ?::date AND ?::date');
    expect(sql).toContain('AND m.end_date < ?::date');
    expect(values).toEqual(['2026-10-01', '2026-10-31', '2026-11-19']);
    // Renovación: otra membresía pagada del mismo miembro que inicia a más tardar el día 7.
    expect(sql).toContain('WHERE r.member_id = m.member_id');
    expect(sql).toContain("THEN rc.status = 'PAID'");
    expect(sql).toContain('AND r.start_date <= (m.end_date + 7)');
    expect(report.totals.renewalRate).toBe(50);
  });

  it('AC3: las clases sueltas se excluyen del cálculo', async () => {
    const { service, queries } = fixture([
      { month: '2026-10', expiredCount: 1, renewedCount: 1 },
    ]);
    await service.getRenewalRate('2026-10-01', '2026-10-31', NOW);

    const { sql } = queries[0];
    expect(sql).toContain("WHERE m.plan_type IN ('MONTHLY', 'QUARTERLY')");
    expect(sql).toContain("AND r.plan_type IN ('MONTHLY', 'QUARTERLY')");
    expect(sql).not.toContain('DROP_IN');
  });

  it('AC4: sin membresías vencidas muestra "No hay membresías vencidas en ese rango." en lugar de 0 %', async () => {
    const { service } = fixture([]);
    const report = await service.getRenewalRate(
      '2026-10-01',
      '2026-10-31',
      NOW,
    );

    expect(report.message).toBe('No hay membresías vencidas en ese rango.');
    expect(report.totals.renewalRate).toBeNull();
  });

  it('AC5: inicio posterior al fin o más de 12 meses no generan el reporte y dan el motivo', async () => {
    const { service, queries } = fixture([]);

    await expect(
      service.getRenewalRate('2026-10-31', '2026-10-01', NOW),
    ).rejects.toThrow(
      new BadRequestException(
        'La fecha de inicio no puede ser posterior a la de fin.',
      ),
    );
    await expect(
      service.getRenewalRate('2025-10-01', '2026-10-01', NOW),
    ).rejects.toThrow(
      new BadRequestException('El rango no puede ser mayor a 12 meses.'),
    );
    expect(queries).toHaveLength(0);
  });

  it('AC6: Miembro, Entrenador y Recepción no pueden abrir el reporte', () => {
    expect(rolesAllowed(RenewalRateReportController, 'getRenewalRate')).toEqual(
      ['ADMIN'],
    );
  });
});
