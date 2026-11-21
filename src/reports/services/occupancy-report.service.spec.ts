import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  buildOccupancyReport,
  compareOccupancy,
  NO_CLASSES_MESSAGE,
  occupancyLevel,
  occupancyPercent,
  OccupancyReportService,
  RANGE_ORDER_MESSAGE,
  RANGE_TOO_LONG_MESSAGE,
} from '@Reports/services';
import type { OccupancyRepository, OccupancyRow } from '@Reports/repositories';

const row = (
  name: string,
  confirmed: number,
  capacity: number,
  sessions = 1,
): OccupancyRow => ({ name, confirmed, capacity, sessions });

/** Las 7 clases del seed (PAST_CLASSES), en desorden como vienen de la base. */
const SEED_ROWS: OccupancyRow[] = [
  row('Yoga Flow', 5, 10, 2),
  row('HIIT Nocturno', 1, 10),
  row('Spinning Matutino', 6, 8, 2),
  row('Boxeo Fitness', 2, 4),
  row('Pilates Core', 1, 6),
  row('CrossFit Funcional', 3, 3),
  row('Zumba Ritmos', 2, 3),
];

describe('Reportes · occupancyPercent (H28)', () => {
  it('es reservas confirmadas entre cupo por 100, con un decimal', () => {
    expect(occupancyPercent(1, 6)).toBe(16.7);
    expect(occupancyPercent(2, 3)).toBe(66.7);
    expect(occupancyPercent(1, 3)).toBe(33.3);
    expect(occupancyPercent(6, 8)).toBe(75);
    expect(occupancyPercent(3, 3)).toBe(100);
    expect(occupancyPercent(0, 20)).toBe(0);
  });

  it('redondea medio decimal hacia arriba sin errores de coma flotante', () => {
    // 1/8 = 12.5 % y 1/16 = 6.25 % → 6.3 %.
    expect(occupancyPercent(1, 8)).toBe(12.5);
    expect(occupancyPercent(1, 16)).toBe(6.3);
    expect(occupancyPercent(7, 40)).toBe(17.5);
  });

  it('con cupo 0 devuelve 0', () => {
    expect(occupancyPercent(0, 0)).toBe(0);
  });
});

describe('Reportes · orden y resaltado (H28)', () => {
  it('ordena de mayor a menor y desempata por nombre en orden alfabético', () => {
    const sorted = [
      { name: 'Yoga Flow', occupancyPercent: 50 },
      { name: 'boxeo Fitness', occupancyPercent: 50 },
      { name: 'Ángeles Stretch', occupancyPercent: 50 },
      { name: 'Zumba', occupancyPercent: 66.7 },
    ].sort(compareOccupancy);
    expect(sorted.map((item) => item.name)).toEqual([
      'Zumba',
      'Ángeles Stretch',
      'boxeo Fitness',
      'Yoga Flow',
    ]);
  });

  it('con 6 clases o más resalta las 3 de mayor y las 3 de menor ocupación', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => occupancyLevel(i, 6))).toEqual([
      'HIGH',
      'HIGH',
      'HIGH',
      'LOW',
      'LOW',
      'LOW',
    ]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => occupancyLevel(i, 8))).toEqual([
      'HIGH',
      'HIGH',
      'HIGH',
      null,
      null,
      'LOW',
      'LOW',
      'LOW',
    ]);
  });

  it('con menos de 6 marca la mitad superior como mayor y el resto como menor', () => {
    expect([0, 1, 2, 3].map((i) => occupancyLevel(i, 4))).toEqual([
      'HIGH',
      'HIGH',
      'LOW',
      'LOW',
    ]);
    expect([0, 1, 2, 3, 4].map((i) => occupancyLevel(i, 5))).toEqual([
      'HIGH',
      'HIGH',
      'HIGH',
      'LOW',
      'LOW',
    ]);
    expect([0, 1].map((i) => occupancyLevel(i, 2))).toEqual(['HIGH', 'LOW']);
    expect(occupancyLevel(0, 1)).toBe('HIGH');
  });
});

describe('Reportes · buildOccupancyReport (H28)', () => {
  it('agrupa por nombre, ordena y resalta como en el seed', () => {
    const report = buildOccupancyReport('2026-09-01', '2026-11-20', SEED_ROWS);
    expect(
      report?.classes.map((item) => [
        item.name,
        item.occupancyPercent,
        item.level,
      ]),
    ).toEqual([
      ['CrossFit Funcional', 100, 'HIGH'],
      ['Spinning Matutino', 75, 'HIGH'],
      ['Zumba Ritmos', 66.7, 'HIGH'],
      ['Boxeo Fitness', 50, null],
      ['Yoga Flow', 50, 'LOW'],
      ['Pilates Core', 16.7, 'LOW'],
      ['HIIT Nocturno', 10, 'LOW'],
    ]);
    expect(report?.classes[1]).toEqual({
      name: 'Spinning Matutino',
      sessions: 2,
      capacity: 8,
      confirmedReservations: 6,
      occupancyPercent: 75,
      level: 'HIGH',
    });
  });

  it('suma los totales de todas las clases', () => {
    const report = buildOccupancyReport('2026-09-01', '2026-11-20', SEED_ROWS);
    expect(report?.totals).toEqual({
      classCount: 7,
      sessions: 9,
      capacity: 44,
      confirmedReservations: 20,
      occupancyPercent: 45.5,
    });
    expect(report?.from).toBe('2026-09-01');
    expect(report?.to).toBe('2026-11-20');
  });

  it('desempata con el porcentaje ya redondeado a un decimal', () => {
    // 2/3 = 66.666… y 667/1000 = 66.7: con un decimal son iguales y gana el nombre.
    const report = buildOccupancyReport('2026-09-01', '2026-11-20', [
      row('Zumba', 2, 3),
      row('Aeróbicos', 667, 1000),
    ]);
    expect(report?.classes.map((item) => item.name)).toEqual([
      'Aeróbicos',
      'Zumba',
    ]);
  });

  it('una sola clase queda como mayor', () => {
    const report = buildOccupancyReport('2026-11-01', '2026-11-20', [
      row('Yoga Flow', 0, 15),
    ]);
    expect(report?.classes).toEqual([
      {
        name: 'Yoga Flow',
        sessions: 1,
        capacity: 15,
        confirmedReservations: 0,
        occupancyPercent: 0,
        level: 'HIGH',
      },
    ]);
  });

  it('sin clases devuelve null', () => {
    expect(buildOccupancyReport('2026-11-01', '2026-11-20', [])).toBeNull();
  });
});

describe('Reportes · OccupancyReportService (H28)', () => {
  const repository = (rows: OccupancyRow[]) => {
    const occupancyByClassName = vi.fn().mockResolvedValue(rows);
    return {
      occupancyByClassName,
      service: new OccupancyReportService({
        occupancyByClassName,
      } as unknown as OccupancyRepository),
    };
  };

  it('consulta la base con el rango y arma el reporte', async () => {
    const { service, occupancyByClassName } = repository(SEED_ROWS);
    const report = await service.getOccupancy('2026-09-01', '2026-11-20');
    expect(occupancyByClassName).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-11-20',
    );
    expect(report.classes).toHaveLength(7);
  });

  it('sin clases en el rango no genera el reporte (404 con el motivo)', async () => {
    const { service } = repository([]);
    const error = await service
      .getOccupancy('2020-01-01', '2020-01-31')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(NO_CLASSES_MESSAGE);
  });

  it.each([
    ['2026-11-20', '2026-09-01', RANGE_ORDER_MESSAGE],
    ['2026-01-01', '2027-01-01', RANGE_TOO_LONG_MESSAGE],
    ['2026-02-29', '2026-03-10', 'La fecha 2026-02-29 no existe.'],
  ])(
    'con %s a %s responde 400 sin consultar la base',
    async (from, to, message) => {
      const { service, occupancyByClassName } = repository(SEED_ROWS);
      const error = await service
        .getOccupancy(from, to)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(message);
      expect(occupancyByClassName).not.toHaveBeenCalled();
    },
  );
});
