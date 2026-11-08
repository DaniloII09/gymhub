import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CLASS_CAPACITY_RANGE_MESSAGE,
  CLASS_DURATION_RANGE_MESSAGE,
  CLASS_NAME_LENGTH_MESSAGE,
  ENDS_BEFORE_STARTS_MESSAGE,
  PAST_STARTS_AT_MESSAGE,
  type CreateClassDto,
} from '@Classes/dto';
import {
  CapacityBelowConfirmedReservationsError,
  ClassNotFoundError,
  ClassNotScheduledError,
  InvalidTrainerRoleError,
  TrainerNotFoundError,
  TrainerScheduleConflictError,
} from '@Classes/errors';
import {
  ClassRepository,
  type GymClassWithDetails,
} from '@Classes/repositories';
import {
  CLASS_NOT_FOUND_MESSAGE,
  CLASS_NOT_SCHEDULED_MESSAGE,
  ClassesService,
  INVALID_TRAINER_ROLE_MESSAGE,
  TRAINER_NOT_FOUND_MESSAGE,
} from '@Classes/services';
import type { PrismaService } from '@Prisma/services';

const TRAINER_ID = '11111111-1111-4111-8111-111111111111';

function futureSchedule(
  startHourUtc = 18,
  startMinuteUtc = 0,
  durationMinutes = 50,
): { startsAt: Date; endsAt: Date } {
  const now = new Date();
  const startsAt = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 7,
      startHourUtc,
      startMinuteUtc,
      0,
      0,
    ),
  );
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return { startsAt, endsAt };
}

const sampleClass = (
  overrides: Partial<GymClassWithDetails> = {},
): GymClassWithDetails => {
  const { startsAt, endsAt } = futureSchedule(18, 0, 50);
  return {
    id: 1,
    name: 'Spinning 18h',
    trainerId: TRAINER_ID,
    trainer: {
      id: TRAINER_ID,
      fullName: 'Entrenador Demo',
      email: 'entrenador@gymhub.test',
    },
    startsAt,
    endsAt,
    capacity: 20,
    confirmedReservations: 0,
    status: 'SCHEDULED',
    createdAt: new Date('2026-11-08T15:00:00Z'),
    updatedAt: new Date('2026-11-08T15:00:00Z'),
    ...overrides,
  };
};

describe('ClassesService', () => {
  let repository: {
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    countConfirmedReservations: ReturnType<typeof vi.fn>;
  };
  let service: ClassesService;

  beforeEach(() => {
    repository = {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      countConfirmedReservations: vi.fn(),
    };
    service = new ClassesService(repository as unknown as ClassRepository);
  });

  const validCreateDto = (
    overrides: Partial<CreateClassDto> = {},
  ): CreateClassDto => ({
    name: 'Spinning 18h',
    trainerId: TRAINER_ID,
    ...futureSchedule(18, 0, 50),
    capacity: 20,
    ...overrides,
  });

  describe('create', () => {
    it('programa una clase con estado SCHEDULED y recorta el nombre', async () => {
      const expected = sampleClass();
      repository.create.mockResolvedValue(expected);

      const dto = validCreateDto({ name: '  Spinning 18h  ' });
      await expect(service.create(dto)).resolves.toEqual(expected);

      expect(repository.create).toHaveBeenCalledWith({
        name: 'Spinning 18h',
        trainerId: TRAINER_ID,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        capacity: 20,
      });
    });

    it.each([0, 51, -1])(
      'rechaza un cupo inválido (%s) con 400 sin tocar el repositorio',
      async (capacity) => {
        await expect(
          service.create(validCreateDto({ capacity })),
        ).rejects.toThrow(new BadRequestException(CLASS_CAPACITY_RANGE_MESSAGE));
        expect(repository.create).not.toHaveBeenCalled();
      },
    );

    it.each(['ab', 'x'.repeat(61)])(
      'rechaza un nombre fuera de 3 a 60 caracteres (%s)',
      async (name) => {
        await expect(service.create(validCreateDto({ name }))).rejects.toThrow(
          new BadRequestException(CLASS_NAME_LENGTH_MESSAGE),
        );
        expect(repository.create).not.toHaveBeenCalled();
      },
    );

    it('rechaza una fecha de inicio en el pasado con el motivo', async () => {
      const startsAt = new Date(Date.now() - 10 * 60_000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

      await expect(
        service.create(validCreateDto({ startsAt, endsAt })),
      ).rejects.toThrow(new BadRequestException(PAST_STARTS_AT_MESSAGE));
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza endsAt igual a startsAt', async () => {
      const { startsAt } = futureSchedule(18, 0, 60);

      await expect(
        service.create(validCreateDto({ startsAt, endsAt: startsAt })),
      ).rejects.toThrow(new BadRequestException(ENDS_BEFORE_STARTS_MESSAGE));
      expect(repository.create).not.toHaveBeenCalled();
    });

    it.each([29, 181])(
      'rechaza una duración de %s minutos fuera del rango 30-180',
      async (durationMinutes) => {
        await expect(
          service.create(
            validCreateDto(futureSchedule(18, 0, durationMinutes)),
          ),
        ).rejects.toThrow(new BadRequestException(CLASS_DURATION_RANGE_MESSAGE));
        expect(repository.create).not.toHaveBeenCalled();
      },
    );

    it('devuelve 409 cuando una clase de 18:00 a 18:50 se cruza con otra a las 18:30', async () => {
      const existing = futureSchedule(18, 0, 50);
      const overlappingAttempt = futureSchedule(18, 30, 50);

      repository.create.mockRejectedValue(
        new TrainerScheduleConflictError({
          kind: 'CLASS',
          id: 10,
          name: 'Spinning 18h',
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
        }),
      );

      const error = await service
        .create(validCreateDto(overlappingAttempt))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toContain('Spinning 18h');
      expect((error as ConflictException).message).toContain('18:00 a 18:50');
    });

    it('permite una clase que inicia a las 18:00 cuando otra termina exactamente a las 18:00', async () => {
      const contiguous = futureSchedule(18, 0, 60);
      const created = sampleClass({
        id: 2,
        name: 'Yoga 18h',
        startsAt: contiguous.startsAt,
        endsAt: contiguous.endsAt,
      });
      repository.create.mockResolvedValue(created);

      await expect(
        service.create(
          validCreateDto({
            name: 'Yoga 18h',
            startsAt: contiguous.startsAt,
            endsAt: contiguous.endsAt,
          }),
        ),
      ).resolves.toEqual(created);
    });

    it.each([
      [
        new TrainerNotFoundError(TRAINER_ID),
        NotFoundException,
        TRAINER_NOT_FOUND_MESSAGE,
      ],
      [
        new InvalidTrainerRoleError(TRAINER_ID),
        BadRequestException,
        INVALID_TRAINER_ROLE_MESSAGE,
      ],
    ])(
      'traduce %s a su excepción HTTP correspondiente',
      async (domainError, HttpError, message) => {
        repository.create.mockRejectedValue(domainError);

        const error = await service
          .create(validCreateDto())
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(HttpError);
        expect((error as Error).message).toBe(message);
      },
    );
  });

  describe('update', () => {
    it('con 12 reservas confirmadas, bajar el cupo de 20 a 10 devuelve 409 con el mensaje exacto', async () => {
      repository.update.mockRejectedValue(
        new CapacityBelowConfirmedReservationsError(12),
      );

      const error = await service
        .update(1, { capacity: 10 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'El cupo no puede ser menor a las 12 reservas confirmadas.',
      );
    });

    it('permite cambiar el cupo a un valor igual o mayor que las reservas confirmadas', async () => {
      const updated = sampleClass({ capacity: 12, confirmedReservations: 12 });
      repository.update.mockResolvedValue(updated);

      await expect(service.update(1, { capacity: 12 })).resolves.toEqual(
        updated,
      );
      expect(repository.update).toHaveBeenCalledWith(1, { capacity: 12 });
    });

    it.each([
      [new ClassNotFoundError(99), NotFoundException, CLASS_NOT_FOUND_MESSAGE],
      [
        new ClassNotScheduledError(1),
        ConflictException,
        CLASS_NOT_SCHEDULED_MESSAGE,
      ],
    ])(
      'traduce %s al editar una clase',
      async (domainError, HttpError, message) => {
        repository.update.mockRejectedValue(domainError);

        const error = await service
          .update(1, { capacity: 25 })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(HttpError);
        expect((error as Error).message).toBe(message);
      },
    );
  });
});

describe('ClassRepository · reglas transaccionales', () => {
  it('devuelve 0 en countConfirmedReservations mientras falte el modelo de reservas de H07 (DB-7.1)', async () => {
    const repo = new ClassRepository({} as unknown as PrismaService);
    await expect(repo.countConfirmedReservations(1)).resolves.toBe(0);
  });

  it('al simular 12 reservas confirmadas, rechaza bajar el cupo de 20 a 10 sin modificar la clase', async () => {
    const existing = sampleClass({ capacity: 20 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: existing.id }]),
      gymClass: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(existing),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };

    const repo = new ClassRepository(prisma as unknown as PrismaService);
    vi.spyOn(repo, 'countConfirmedReservations').mockResolvedValue(12);

    await expect(repo.update(existing.id, { capacity: 10 })).rejects.toThrow(
      'El cupo no puede ser menor a las 12 reservas confirmadas.',
    );
    expect(tx.gymClass.update).not.toHaveBeenCalled();
  });
});

