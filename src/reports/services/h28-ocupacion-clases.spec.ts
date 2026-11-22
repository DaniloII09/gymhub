import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OccupancyReportController } from '@Reports/controllers';
import { OccupancyRepository } from '@Reports/repositories';
import { OccupancyReportService } from '@Reports/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';
import { captureQueryRaw } from '../../../test/helpers/sql-capture.js';

const row = (name: string, confirmed: number, capacity = 20, sessions = 1) => ({
  name,
  sessions,
  capacity,
  confirmed,
});

function fixture(rows: object[]) {
  const raw = captureQueryRaw([rows]);
  const service = new OccupancyReportService(
    new OccupancyRepository({ $queryRaw: raw.fn } as never),
  );
  return { queries: raw.queries, service };
}

describe('H28. Ver la ocupación de las clases', () => {
  it('AC1: cada clase agrupada por nombre con su ocupación con un decimal, de mayor a menor', async () => {
    const { service, queries } = fixture([
      row('Yoga', 5, 15),
      row('Spinning', 18, 20),
      row('Box', 7, 30),
    ]);
    const report = await service.getOccupancy('2026-11-01', '2026-11-30');

    expect(report.classes.map((c) => [c.name, c.occupancyPercent])).toEqual([
      ['Spinning', 90],
      ['Yoga', 33.3],
      ['Box', 23.3],
    ]);
    expect(queries[0].sql).toContain('GROUP BY g.name');
  });

  it('AC2: ocupación = confirmadas / suma de cupos × 100, solo de clases no canceladas, ya terminadas y del rango', async () => {
    // Dos clases "Spinning" de 20 cupos con 15 y 10 confirmadas: 25 / 40 = 62.5 %.
    const { service, queries } = fixture([row('Spinning', 25, 40, 2)]);
    const report = await service.getOccupancy('2026-11-01', '2026-11-30');

    expect(report.classes[0]).toMatchObject({
      sessions: 2,
      capacity: 40,
      confirmedReservations: 25,
      occupancyPercent: 62.5,
    });
    const { sql, values } = queries[0];
    expect(sql).toContain("WHERE status = 'CONFIRMED'");
    expect(sql).toContain('SUM(g.capacity)::int AS capacity');
    expect(sql).toContain("WHERE g.status = 'SCHEDULED'");
    expect(sql).toContain("AND g.ends_at < timezone('UTC', now())");
    expect(sql).toContain(
      "timezone(?, g.starts_at AT TIME ZONE 'UTC')::date BETWEEN ?::date AND ?::date",
    );
    expect(values).toEqual(['America/El_Salvador', '2026-11-01', '2026-11-30']);
  });

  it('AC3: con 6 o más se resaltan 3 mayores y 3 menores; con menos, mitad superior mayor y el resto menor', async () => {
    const seven = fixture(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => row(n, 20 - i * 2)),
    );
    const levels7 = (
      await seven.service.getOccupancy('2026-11-01', '2026-11-30')
    ).classes.map((c) => c.level);
    expect(levels7).toEqual([
      'HIGH',
      'HIGH',
      'HIGH',
      null,
      'LOW',
      'LOW',
      'LOW',
    ]);

    const five = fixture(
      ['A', 'B', 'C', 'D', 'E'].map((n, i) => row(n, 20 - i * 2)),
    );
    const levels5 = (
      await five.service.getOccupancy('2026-11-01', '2026-11-30')
    ).classes.map((c) => c.level);
    expect(levels5).toEqual(['HIGH', 'HIGH', 'HIGH', 'LOW', 'LOW']);

    const one = fixture([row('Solo', 10)]);
    expect(
      (await one.service.getOccupancy('2026-11-01', '2026-11-30')).classes[0]
        .level,
    ).toBe('HIGH');
  });

  it('AC4: con el mismo porcentaje se desempata por nombre en orden alfabético', async () => {
    const { service } = fixture([
      row('Zumba', 10),
      row('aeróbicos', 10),
      row('Box', 10),
      row('Yoga', 15),
    ]);
    const report = await service.getOccupancy('2026-11-01', '2026-11-30');

    expect(report.classes.map((c) => c.name)).toEqual([
      'Yoga',
      'aeróbicos',
      'Box',
      'Zumba',
    ]);
  });

  it('AC5: inicio posterior al fin, más de 12 meses o un rango sin clases no generan reporte y dan el motivo', async () => {
    const { service, queries } = fixture([]);

    await expect(
      service.getOccupancy('2026-11-30', '2026-11-01'),
    ).rejects.toThrow(
      new BadRequestException(
        'La fecha de inicio no puede ser posterior a la de fin.',
      ),
    );
    await expect(
      service.getOccupancy('2025-11-01', '2026-11-01'),
    ).rejects.toThrow(
      new BadRequestException('El rango no puede ser mayor a 12 meses.'),
    );
    expect(queries).toHaveLength(0);
    await expect(
      service.getOccupancy('2026-11-01', '2026-11-30'),
    ).rejects.toThrow(new NotFoundException('No hay clases en ese rango.'));
  });

  it('AC6: solo el Administrador puede abrir el reporte', () => {
    expect(rolesAllowed(OccupancyReportController, 'getOccupancy')).toEqual([
      'ADMIN',
    ]);
  });
});
