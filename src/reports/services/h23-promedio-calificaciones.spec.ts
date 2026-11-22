import { BadRequestException } from '@nestjs/common';
import { RatingsReportController } from '@Reports/controllers';
import { RatingsRepository } from '@Reports/repositories';
import { RatingsReportService } from '@Reports/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';
import { captureQueryRaw } from '../../../test/helpers/sql-capture.js';

const ANA = { trainerId: 't-ana', trainerName: 'Ana Entrenadora' };
const BETO = { trainerId: 't-beto', trainerName: 'Beto Entrenador' };
const CARLA = { trainerId: 't-carla', trainerName: 'Carla Entrenadora' };

/** Repositorio real; Prisma responde las filas agregadas de entrenadores y clases. */
function fixture(trainers: object[], classes: object[]) {
  const raw = captureQueryRaw([trainers, classes]);
  const service = new RatingsReportService(
    new RatingsRepository({ $queryRaw: raw.fn } as never),
  );
  return {
    queries: raw.queries,
    service,
    controller: new RatingsReportController(service),
  };
}

describe('H23. Ver el promedio de calificación por entrenador y por clase', () => {
  it('AC1: por entrenador, promedio con un decimal y cantidad, sumando clases y sesiones personales', async () => {
    // Ana: 5 y 4 en clases + 4 en una sesión = 13 / 3 = 4.33 -> 4.3
    const { service, queries } = fixture(
      [{ ...ANA, ratingSum: 13, reviewCount: 3 }],
      [],
    );
    const report = await service.getRatings('2026-11-01', '2026-11-30');

    expect(report.byTrainer).toEqual([
      { ...ANA, averageRating: 4.3, reviewCount: 3 },
    ]);
    expect(queries[0].sql).toContain(
      'LEFT JOIN gym_classes gc ON gc.id = rv.gym_class_id',
    );
    expect(queries[0].sql).toContain(
      'LEFT JOIN personal_sessions ps ON ps.id = rv.personal_session_id',
    );
    expect(queries[0].sql).toContain('COALESCE(gc.trainer_id, ps.trainer_id)');
  });

  it('AC2: por clase, promedio y cantidad agrupados por el nombre de la clase', async () => {
    const { service, queries } = fixture(
      [],
      [{ className: 'Spinning', ratingSum: 9, reviewCount: 2 }],
    );
    const report = await service.getRatings('2026-11-01', '2026-11-30');

    expect(report.byClassName).toEqual([
      { className: 'Spinning', averageRating: 4.5, reviewCount: 2 },
    ]);
    expect(queries[1].sql).toContain('GROUP BY gc.name');
  });

  it('AC3: un rango de hasta 12 meses filtra por la fecha de la reseña', async () => {
    const { service, queries } = fixture(
      [{ ...ANA, ratingSum: 5, reviewCount: 1 }],
      [],
    );
    await service.getRatings('2026-01-01', '2026-12-31');

    for (const q of queries) {
      expect(q.sql).toContain(
        "timezone(?, rv.created_at AT TIME ZONE 'UTC')::date BETWEEN ?::date AND ?::date",
      );
      expect(q.values).toEqual([
        'America/El_Salvador',
        '2026-01-01',
        '2026-12-31',
      ]);
    }
    await expect(
      service.getRatings('2026-01-01', '2027-01-01'),
    ).rejects.toThrow(
      new BadRequestException('El rango no puede ser mayor a 12 meses.'),
    );
    await expect(
      service.getRatings('2026-11-30', '2026-11-01'),
    ).rejects.toThrow(
      new BadRequestException(
        'La fecha de inicio no puede ser posterior a la de fin.',
      ),
    );
  });

  it('AC4: ordena de menor a mayor promedio y, con el mismo promedio, por nombre', async () => {
    const { service } = fixture(
      [
        { ...CARLA, ratingSum: 9, reviewCount: 2 }, // 4.5
        { ...BETO, ratingSum: 7, reviewCount: 2 }, // 3.5
        { ...ANA, ratingSum: 18, reviewCount: 4 }, // 4.5
      ],
      [
        { className: 'Yoga', ratingSum: 4, reviewCount: 1 },
        { className: 'spinning', ratingSum: 4, reviewCount: 1 },
        { className: 'Box', ratingSum: 3, reviewCount: 1 },
      ],
    );
    const report = await service.getRatings('2026-11-01', '2026-11-30');

    expect(
      report.byTrainer.map((t) => [t.trainerName, t.averageRating]),
    ).toEqual([
      ['Beto Entrenador', 3.5],
      ['Ana Entrenadora', 4.5],
      ['Carla Entrenadora', 4.5],
    ]);
    expect(report.byClassName.map((c) => c.className)).toEqual([
      'Box',
      'spinning',
      'Yoga',
    ]);
  });

  it('AC5: sin reseñas en el rango responde "No hay reseñas en ese rango."', async () => {
    const { controller } = fixture([], []);
    const report = await controller.getRatings({
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(report).toMatchObject({
      byTrainer: [],
      byClassName: [],
      message: 'No hay reseñas en ese rango.',
    });
  });

  it('AC6: solo el Administrador puede abrir el reporte', () => {
    expect(rolesAllowed(RatingsReportController, 'getRatings')).toEqual([
      'ADMIN',
    ]);
  });
});
