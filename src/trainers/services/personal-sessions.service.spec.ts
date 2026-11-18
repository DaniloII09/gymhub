import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@Config';
import {
  InvalidTrainerRoleError,
  SessionPricingUnavailableError,
  SessionSlotAlreadyTakenError,
  TrainerNotFoundError,
} from '@Trainers/errors';
import type {
  PersonalSessionRepository,
  PersonalSessionWithDetails,
} from '@Trainers/repositories';
import type { AvailabilityBlocksService } from './availability-blocks.service.js';
import {
  MIN_BOOKING_ADVANCE_MESSAGE,
  PersonalSessionsService,
  SLOT_ALREADY_TAKEN_MESSAGE,
  SLOT_NOT_IN_AVAILABILITY_MESSAGE,
  SLOTS_RANGE_EXCEEDED_MESSAGE,
} from './personal-sessions.service.js';
import { SessionPricingService } from './session-pricing.service.js';

const TRAINER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const BLOCK_ID = 'a0000000-0000-4000-8000-000000000001';

const ACTIVE_TRAINER = {
  id: TRAINER_ID,
  fullName: 'Entrenador Demo',
  email: 'entrenador@gymhub.test',
  role: 'TRAINER',
  isActive: true,
};

function createMocks() {
  const findActiveTrainers = vi.fn().mockResolvedValue([]);
  const findTrainerById = vi.fn().mockResolvedValue(ACTIVE_TRAINER);
  const findScheduledConflictsForTrainer = vi
    .fn()
    .mockResolvedValue({ sessions: [], classes: [] });
  const getConfiguredDbPrice = vi.fn().mockResolvedValue(null);
  const upsertDbPrice = vi.fn().mockResolvedValue(20);
  const book = vi.fn();
  const findByMember = vi.fn().mockResolvedValue([]);

  const repository = {
    findActiveTrainers,
    findTrainerById,
    findScheduledConflictsForTrainer,
    getConfiguredDbPrice,
    upsertDbPrice,
    book,
    findByMember,
  } as unknown as PersonalSessionRepository;

  const findAllByTrainer = vi.fn().mockResolvedValue([
    {
      id: BLOCK_ID,
      trainerId: TRAINER_ID,
      weekday: 1, // Lunes
      startTime: '08:00',
      endTime: '11:30',
      createdAt: new Date('2026-11-01T00:00:00Z'),
    },
  ]);

  const availabilityBlocksService = {
    findAllByTrainer,
  } as unknown as AvailabilityBlocksService;

  const requireConfiguredPrice = vi.fn().mockResolvedValue(15);
  const pricingService = {
    requireConfiguredPrice,
  } as unknown as SessionPricingService;

  const service = new PersonalSessionsService(
    repository,
    availabilityBlocksService,
    pricingService,
  );

  return {
    service,
    mocks: {
      findActiveTrainers,
      findTrainerById,
      findScheduledConflictsForTrainer,
      book,
      findByMember,
      findAllByTrainer,
      requireConfiguredPrice,
      getConfiguredDbPrice,
      upsertDbPrice,
      repository,
    },
  };
}

describe('PersonalSessionsService (H11)', () => {
  describe('BE-11.1 · listActiveTrainers y listAvailableSlots', () => {
    it('lista entrenadores activos delegando en el repositorio', async () => {
      const { service, mocks } = createMocks();
      const expected = [
        {
          id: TRAINER_ID,
          fullName: 'Entrenador Demo',
          email: 'entrenador@gymhub.test',
        },
      ];
      mocks.findActiveTrainers.mockResolvedValueOnce(expected);

      await expect(service.listActiveTrainers()).resolves.toEqual(expected);
      expect(mocks.findActiveTrainers).toHaveBeenCalledTimes(1);
    });

    it('rechaza rangos mayores a 14 días (ej. days=15 o from..to=15 días) con HTTP 400', async () => {
      const { service, mocks } = createMocks();
      const now = new Date('2026-11-23T12:00:00.000Z');

      await expect(
        service.listAvailableSlots(TRAINER_ID, { days: 15 }, now),
      ).rejects.toThrow(new BadRequestException(SLOTS_RANGE_EXCEEDED_MESSAGE));

      const fifteenDaysLater = new Date(now.getTime() + 15 * 86_400_000);
      await expect(
        service.listAvailableSlots(
          TRAINER_ID,
          { from: now, to: fifteenDaysLater },
          now,
        ),
      ).rejects.toThrow(new BadRequestException(SLOTS_RANGE_EXCEEDED_MESSAGE));

      expect(mocks.findTrainerById).not.toHaveBeenCalled();
    });

    it('rechaza entrenadores inexistentes (404) o inactivos / sin rol TRAINER (400)', async () => {
      const { service, mocks } = createMocks();
      const now = new Date('2026-11-23T12:00:00.000Z');

      mocks.findTrainerById.mockResolvedValueOnce(null);
      await expect(
        service.listAvailableSlots(TRAINER_ID, { days: 7 }, now),
      ).rejects.toThrow(NotFoundException);

      mocks.findTrainerById.mockResolvedValueOnce({
        ...ACTIVE_TRAINER,
        isActive: false,
      });
      await expect(
        service.listAvailableSlots(TRAINER_ID, { days: 7 }, now),
      ).rejects.toThrow(BadRequestException);
    });

    it('excluye fragmentos < 60m, sesiones SCHEDULED y clases grupales sin ocultar contiguos', async () => {
      const { service, mocks } = createMocks();
      // Domingo 22 nov 2026 06:00Z (00:00 SV); consulta 2 días incluye Lunes 23 nov.
      const now = new Date('2026-11-22T06:00:00.000Z');
      // Bloque lunes: 08:00-11:30 -> candidatos: 08:00-09:00, 09:00-10:00, 10:00-11:00 (11:00-11:30 descartado).
      // Sesión SCHEDULED 08:00-09:00 SV (14:00Z-15:00Z)
      // Clase grupal SCHEDULED 10:00-10:50 SV (16:00Z-16:50Z) -> cruza 10:00-11:00, NO cruza 09:00-10:00!
      mocks.findScheduledConflictsForTrainer.mockResolvedValueOnce({
        sessions: [
          {
            startsAt: new Date('2026-11-23T14:00:00.000Z'),
            endsAt: new Date('2026-11-23T15:00:00.000Z'),
          },
        ],
        classes: [
          {
            startsAt: new Date('2026-11-23T16:00:00.000Z'),
            endsAt: new Date('2026-11-23T16:50:00.000Z'),
          },
        ],
      });

      const result = await service.listAvailableSlots(
        TRAINER_ID,
        { days: 2 },
        now,
      );

      expect(result.slots).toHaveLength(1);
      expect(result.slots[0].startTime).toBe('09:00');
      expect(result.slots[0].endTime).toBe('10:00');
    });
  });

  describe('BE-11.2 · book y listMine', () => {
    it('rechaza con HTTP 400 cuando faltan menos de 12 horas (ej. 11 horas)', async () => {
      const { service, mocks } = createMocks();
      const slotStart = new Date('2026-11-23T15:00:00.000Z'); // Lunes 09:00 SV
      const nowElevenHoursBefore = new Date(
        slotStart.getTime() - 11 * 60 * 60 * 1000,
      );

      await expect(
        service.book(
          MEMBER_ID,
          { trainerId: TRAINER_ID, startsAt: slotStart },
          nowElevenHoursBefore,
        ),
      ).rejects.toThrow(new BadRequestException(MIN_BOOKING_ADVANCE_MESSAGE));

      expect(mocks.book).not.toHaveBeenCalled();
    });

    it('rechaza horarios que no coinciden con un espacio libre de 60 minutos', async () => {
      const { service, mocks } = createMocks();
      // Lunes 11:00 SV corresponde al fragmento 11:00-11:30 (<60 min)
      const fragmentStart = new Date('2026-11-23T17:00:00.000Z');
      const now = new Date('2026-11-22T12:00:00.000Z');

      await expect(
        service.book(
          MEMBER_ID,
          { trainerId: TRAINER_ID, startsAt: fragmentStart },
          now,
        ),
      ).rejects.toThrow(
        new BadRequestException(SLOT_NOT_IN_AVAILABILITY_MESSAGE),
      );

      expect(mocks.book).not.toHaveBeenCalled();
    });

    it('falla de forma cerrada (HTTP 503) cuando el precio de la sesión no está configurado', async () => {
      const { service, mocks } = createMocks();
      mocks.requireConfiguredPrice.mockRejectedValueOnce(
        new SessionPricingUnavailableError(),
      );
      const slotStart = new Date('2026-11-23T15:00:00.000Z');
      const now = new Date('2026-11-22T12:00:00.000Z');

      await expect(
        service.book(
          MEMBER_ID,
          { trainerId: TRAINER_ID, startsAt: slotStart },
          now,
        ),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mocks.book).not.toHaveBeenCalled();
    });

    it('agenda a exactamente 12h+ con tarifa configurada y propaga datos de cobro PENDING', async () => {
      const { service, mocks } = createMocks();
      const slotStart = new Date('2026-11-23T15:00:00.000Z'); // Lunes 09:00 SV
      const nowTwelveHoursBefore = new Date(
        slotStart.getTime() - 12 * 60 * 60 * 1000,
      );
      const expected = {
        id: 1,
        trainerId: TRAINER_ID,
        trainer: {
          id: TRAINER_ID,
          fullName: 'Entrenador Demo',
          email: 'entrenador@gymhub.test',
        },
        memberId: MEMBER_ID,
        availabilityBlockId: BLOCK_ID,
        startsAt: slotStart,
        endsAt: new Date('2026-11-23T16:00:00.000Z'),
        price: 15 as unknown as PersonalSessionWithDetails['price'],
        chargeId: 42,
        chargeStatus: 'PENDING',
        status: 'SCHEDULED',
        createdAt: nowTwelveHoursBefore,
      } as PersonalSessionWithDetails;
      mocks.book.mockResolvedValueOnce(expected);

      const result = await service.book(
        MEMBER_ID,
        { trainerId: TRAINER_ID, startsAt: slotStart },
        nowTwelveHoursBefore,
      );

      expect(result).toEqual(expected);
      expect(mocks.book).toHaveBeenCalledWith(
        expect.objectContaining({
          trainerId: TRAINER_ID,
          memberId: MEMBER_ID,
          availabilityBlockId: BLOCK_ID,
          startsAt: slotStart,
          endsAt: new Date('2026-11-23T16:00:00.000Z'),
          price: 15,
          concept: 'Sesión personal (2026-11-23 09:00) - Entrenador Demo',
          dueDate: new Date('2026-11-23T00:00:00.000Z'),
        }),
      );
    });

    it('mapea SessionSlotAlreadyTakenError a HTTP 409 ("Ese horario ya fue tomado.")', async () => {
      const { service, mocks } = createMocks();
      mocks.book.mockRejectedValueOnce(new SessionSlotAlreadyTakenError());

      await expect(
        service.book(
          MEMBER_ID,
          {
            trainerId: TRAINER_ID,
            startsAt: new Date('2026-11-23T15:00:00.000Z'),
          },
          new Date('2026-11-22T12:00:00.000Z'),
        ),
      ).rejects.toThrow(new ConflictException(SLOT_ALREADY_TAKEN_MESSAGE));
    });

    it('mapea TrainerNotFoundError (404) e InvalidTrainerRoleError (400)', async () => {
      const { service, mocks } = createMocks();
      const args = {
        trainerId: TRAINER_ID,
        startsAt: new Date('2026-11-23T15:00:00.000Z'),
      };
      const now = new Date('2026-11-22T12:00:00.000Z');

      mocks.book.mockRejectedValueOnce(new TrainerNotFoundError(TRAINER_ID));
      await expect(service.book(MEMBER_ID, args, now)).rejects.toThrow(
        NotFoundException,
      );

      mocks.book.mockRejectedValueOnce(new InvalidTrainerRoleError(TRAINER_ID));
      await expect(service.book(MEMBER_ID, args, now)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('listMine consulta únicamente el memberId recibido del token', async () => {
      const { service, mocks } = createMocks();
      await service.listMine(MEMBER_ID, 'SCHEDULED');
      expect(mocks.findByMember).toHaveBeenCalledWith(MEMBER_ID, 'SCHEDULED');
    });
  });

  describe('DB-11.1 · SessionPricingService', () => {
    it('prioriza BD sobre env y falla de forma cerrada si no hay tarifa configurada', async () => {
      const getConfiguredDbPrice = vi.fn().mockResolvedValueOnce(25.5);
      const upsertDbPrice = vi.fn().mockResolvedValueOnce(30);
      const repo = {
        getConfiguredDbPrice,
        upsertDbPrice,
      } as unknown as PersonalSessionRepository;
      const getConfig = vi.fn().mockReturnValue(15);
      const configService = {
        get: getConfig,
      } as unknown as ConfigService<EnvConfig, true>;

      const pricing = new SessionPricingService(repo, configService);
      await expect(pricing.requireConfiguredPrice()).resolves.toBe(25.5);

      getConfiguredDbPrice.mockResolvedValueOnce(null);
      await expect(pricing.requireConfiguredPrice()).resolves.toBe(15);

      getConfiguredDbPrice.mockResolvedValueOnce(null);
      getConfig.mockReturnValueOnce(null);
      await expect(pricing.requireConfiguredPrice()).rejects.toThrow(
        SessionPricingUnavailableError,
      );

      await expect(pricing.updatePrice(30.004, 'admin-1')).resolves.toEqual({
        configured: true,
        price: 30,
      });
      expect(upsertDbPrice).toHaveBeenCalledWith(30, 'admin-1');
    });
  });
});
