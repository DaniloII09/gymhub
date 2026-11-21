import { BadRequestException } from '@nestjs/common';
import {
  buildRatingsReport,
  NO_REVIEWS_MESSAGE,
  RANGE_ORDER_MESSAGE,
  RANGE_TOO_LONG_MESSAGE,
  RatingsReportService,
  roundAverageRating,
} from '@Reports/services';
import type { RatingsRepository } from '@Reports/repositories';

describe('Reportes · buildRatingsReport (H23)', () => {
  it('calcula promedio con 1 decimal: 4, 5 y 4 estrellas -> promedio 4.3, count 3', () => {
    expect(roundAverageRating(4 + 5 + 4, 3)).toBe(4.3);

    const report = buildRatingsReport(
      '2026-09-01',
      '2026-11-30',
      [{ trainerId: 't1', trainerName: 'Entrenador Uno', ratingSum: 13, reviewCount: 3 }],
      [{ className: 'Spinning', ratingSum: 13, reviewCount: 3 }],
    );

    expect(report.byTrainer).toEqual([
      {
        trainerId: 't1',
        trainerName: 'Entrenador Uno',
        averageRating: 4.3,
        reviewCount: 3,
      },
    ]);
    expect(report.byClassName).toEqual([
      {
        className: 'Spinning',
        averageRating: 4.3,
        reviewCount: 3,
      },
    ]);
    expect(report.message).toBeNull();
  });

  it('ordena de menor a mayor promedio y en empates de 4.0 por nombre alfabético', () => {
    const report = buildRatingsReport(
      '2026-09-01',
      '2026-11-30',
      [
        { trainerId: 't-z', trainerName: 'Zoe Perez', ratingSum: 8, reviewCount: 2 },
        { trainerId: 't-a', trainerName: 'Ana Lopez', ratingSum: 8, reviewCount: 2 },
        { trainerId: 't-low', trainerName: 'Carlos Ruiz', ratingSum: 5, reviewCount: 2 },
        { trainerId: 't-high', trainerName: 'Beto Diaz', ratingSum: 10, reviewCount: 2 },
      ],
      [
        { className: 'Zumba', ratingSum: 8, reviewCount: 2 },
        { className: 'Boxeo', ratingSum: 8, reviewCount: 2 },
        { className: 'CrossFit', ratingSum: 7, reviewCount: 2 },
      ],
    );

    expect(report.byTrainer.map((t) => `${t.trainerName}:${t.averageRating}`)).toEqual([
      'Carlos Ruiz:2.5',
      'Ana Lopez:4',
      'Zoe Perez:4',
      'Beto Diaz:5',
    ]);
    expect(report.byClassName.map((c) => `${c.className}:${c.averageRating}`)).toEqual([
      'CrossFit:3.5',
      'Boxeo:4',
      'Zumba:4',
    ]);
  });

  it('sin reseñas en el rango responde listas vacías y "No hay reseñas en ese rango."', () => {
    const report = buildRatingsReport('2026-10-01', '2026-10-31', [], []);
    expect(report).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      byTrainer: [],
      byClassName: [],
      message: NO_REVIEWS_MESSAGE,
    });
  });
});

describe('Reportes · RatingsReportService (H23)', () => {
  function build() {
    const ratingsRepository = {
      ratingsInRange: vi.fn().mockResolvedValue({ trainers: [], classes: [] }),
    };
    const service = new RatingsReportService(
      ratingsRepository as unknown as RatingsRepository,
    );
    return { service, ratingsRepository };
  }

  it.each([
    ['2026-11-30', '2026-09-01', RANGE_ORDER_MESSAGE],
    ['2026-01-01', '2027-01-01', RANGE_TOO_LONG_MESSAGE],
    ['2026-02-30', '2026-03-01', 'La fecha 2026-02-30 no existe.'],
  ])('rechaza rango inválido %s..%s sin consultar BD', async (from, to, message) => {
    const { service, ratingsRepository } = build();
    const err = await service.getRatings(from, to).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe(message);
    expect(ratingsRepository.ratingsInRange).not.toHaveBeenCalled();
  });
});
