import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProgressEntryDto } from '@Routines/dto';
import {
  DuplicateProgressDateError,
  ProgressEntryNotFoundError,
} from '@Routines/errors';
import type {
  ProgressRepository,
  StoredProgressEntry,
} from '@Routines/repositories';
import {
  buildProgressEvolution,
  FUTURE_DATE_MESSAGE,
  gymToday,
  isRealCalendarDate,
  ProgressService,
} from '@Routines/services';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

const entry = (
  id: number,
  date: string,
  weightKg: number,
  overrides: Partial<StoredProgressEntry> = {},
): StoredProgressEntry => ({
  id,
  date,
  weightKg,
  chestCm: 98,
  waistCm: 84,
  armCm: 34,
  isBaseline: false,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
  ...overrides,
});

describe('CreateProgressEntryDto validación (BE-19.1)', () => {
  const validateDto = async (payload: object) => {
    const dto = plainToInstance(CreateProgressEntryDto, payload);
    return validate(dto);
  };

  it('acepta los límites exactos de peso (20..300) y medidas (10..250)', async () => {
    const min = await validateDto({
      date: '2026-11-20',
      weightKg: 20,
      chestCm: 10,
      waistCm: 10,
      armCm: 10,
    });
    const max = await validateDto({
      date: '2026-11-20',
      weightKg: 300,
      chestCm: 250,
      waistCm: 250,
      armCm: 250,
    });
    expect(min).toHaveLength(0);
    expect(max).toHaveLength(0);
  });

  it.each([
    ['peso < 20', { date: '2026-11-20', weightKg: 19.9, chestCm: 90, waistCm: 80, armCm: 30 }],
    ['peso > 300', { date: '2026-11-20', weightKg: 300.1, chestCm: 90, waistCm: 80, armCm: 30 }],
    ['pecho < 10', { date: '2026-11-20', weightKg: 70, chestCm: 9.9, waistCm: 80, armCm: 30 }],
    ['cintura > 250', { date: '2026-11-20', weightKg: 70, chestCm: 90, waistCm: 250.1, armCm: 30 }],
    ['brazo < 10', { date: '2026-11-20', weightKg: 70, chestCm: 90, waistCm: 80, armCm: 9 }],
    ['formato fecha', { date: '20/11/2026', weightKg: 70, chestCm: 90, waistCm: 80, armCm: 30 }],
  ])('rechaza %s', async (_label, payload) => {
    const errors = await validateDto(payload);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('buildProgressEvolution (BE-19.2)', () => {
  it('con 76.0 kg iniciales y 72.5 kg finales devuelve -3.5 kg e isBaseline=true solo en el primero', () => {
    const evolution = buildProgressEvolution([
      entry(1, '2026-10-01', 76.0, { chestCm: 98, waistCm: 84, armCm: 34 }),
      entry(2, '2026-11-15', 72.5, { chestCm: 99.5, waistCm: 80.5, armCm: 34.5 }),
    ]);

    expect(evolution.entries[0].isBaseline).toBe(true);
    expect(evolution.entries[1].isBaseline).toBe(false);
    expect(evolution.deltas).toEqual({
      weightKg: -3.5,
      chestCm: 1.5,
      waistCm: -3.5,
      armCm: 0.5,
    });
  });

  it('con un solo registro devuelve isBaseline=true y todas las diferencias en 0', () => {
    const evolution = buildProgressEvolution([entry(1, '2026-11-01', 76.0)]);
    expect(evolution.entries[0].isBaseline).toBe(true);
    expect(evolution.deltas).toEqual({
      weightKg: 0,
      chestCm: 0,
      waistCm: 0,
      armCm: 0,
    });
  });

  it('sin registros devuelve entries vacío y deltas null', () => {
    expect(buildProgressEvolution([])).toEqual({ entries: [], deltas: null });
  });
});

describe('ProgressService (H19)', () => {
  function build() {
    const progressRepository = {
      create: vi.fn(),
      updateMine: vi.fn(),
      findByMemberOrdered: vi.fn().mockResolvedValue([]),
    };
    const service = new ProgressService(
      progressRepository as unknown as ProgressRepository,
    );
    return { service, progressRepository };
  }

  it('rechaza fechas futuras según la zona del gimnasio (El Salvador) y fechas inexistentes', async () => {
    const { service, progressRepository } = build();
    // 19 nov 2026 20:00 SV = 20 nov 2026 02:00 UTC -> hoy SV es 2026-11-19.
    const now = new Date('2026-11-20T02:00:00.000Z');
    expect(gymToday(now)).toBe('2026-11-19');
    expect(isRealCalendarDate('2026-02-29')).toBe(false);

    await expect(
      service.create(
        MEMBER_ID,
        { date: '2026-11-20', weightKg: 75, chestCm: 95, waistCm: 80, armCm: 34 },
        now,
      ),
    ).rejects.toThrow(new BadRequestException(FUTURE_DATE_MESSAGE));

    await expect(
      service.create(
        MEMBER_ID,
        { date: '2026-02-30', weightKg: 75, chestCm: 95, waistCm: 80, armCm: 34 },
        now,
      ),
    ).rejects.toThrow(new BadRequestException('La fecha 2026-02-30 no existe.'));

    expect(progressRepository.create).not.toHaveBeenCalled();
  });

  it('traduce DuplicateProgressDateError a 409 y ProgressEntryNotFoundError a 404', async () => {
    const { service, progressRepository } = build();
    const now = new Date('2026-11-20T18:00:00.000Z');
    progressRepository.create.mockRejectedValue(new DuplicateProgressDateError());

    await expect(
      service.create(
        MEMBER_ID,
        { date: '2026-11-20', weightKg: 75, chestCm: 95, waistCm: 80, armCm: 34 },
        now,
      ),
    ).rejects.toThrow(new ConflictException('Ya tienes un registro en esa fecha.'));

    progressRepository.updateMine.mockRejectedValue(new ProgressEntryNotFoundError());
    await expect(
      service.updateMine(99, MEMBER_ID, { weightKg: 74 }, now),
    ).rejects.toThrow(new NotFoundException('No encontramos ese registro de progreso.'));
  });
});
