import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import {
  MEMBERSHIP_STATUS_SERVICE,
  type CurrentMembership,
} from '@Common/contracts';
import {
  AlreadyReservedError,
  ClassAlreadyStartedError,
  ClassFullError,
  ClassNotFoundError,
  ClassNotScheduledError,
} from '@Classes/errors';
import type {
  ClassReservationRepository,
  ClassReservationWithClass,
} from '@Classes/repositories';
import {
  ALREADY_RESERVED_MESSAGE,
  CLASS_FULL_CODE,
  CLASS_FULL_MESSAGE,
  CLASS_NOT_FOUND_MESSAGE,
  ClassReservationsService,
  MembershipEligibilityService,
  RESERVATION_NOT_SCHEDULED_MESSAGE,
} from '@Classes/services';

const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const TRAINER_ID = '11111111-1111-4111-8111-111111111111';

const sampleReservation = (): ClassReservationWithClass => ({
  id: 10,
  classId: 1,
  memberId: MEMBER_ID,
  status: 'CONFIRMED',
  origin: 'MEMBERSHIP',
  cancelledAt: null,
  createdAt: new Date('2026-11-18T05:00:00Z'),
  updatedAt: new Date('2026-11-18T05:00:00Z'),
  gymClass: {
    id: 1,
    name: 'Spinning 18h',
    trainerId: TRAINER_ID,
    trainer: {
      id: TRAINER_ID,
      fullName: 'Entrenador Demo',
      email: 'entrenador@gymhub.test',
    },
    startsAt: new Date('2026-12-01T18:00:00Z'),
    endsAt: new Date('2026-12-01T18:50:00Z'),
    capacity: 20,
    confirmedReservations: 18,
    status: 'SCHEDULED',
    createdAt: new Date('2026-11-08T15:00:00Z'),
    updatedAt: new Date('2026-11-08T15:00:00Z'),
  },
});

describe('MembershipEligibilityService', () => {
  it('falla de forma cerrada si H04 (MEMBERSHIP_STATUS_SERVICE) no está registrado', async () => {
    const moduleRef = {
      get: vi.fn(() => {
        throw new Error('Nest could not find MembershipStatusService');
      }),
    };
    const eligibility = new MembershipEligibilityService(
      moduleRef as unknown as ModuleRef,
    );

    expect(eligibility.isProviderAvailable()).toBe(false);
    await expect(eligibility.assertCanReserve(MEMBER_ID)).rejects.toThrow(
      'La verificación de membresías todavía no está disponible (pendiente H04 / BE-4.3).',
    );
  });

  it.each<[CurrentMembership, string]>([
    [
      {
        status: 'NONE',
        planName: null,
        planType: null,
        endDate: null,
        daysLeft: null,
      },
      'Necesitas una membresía activa para reservar.',
    ],
    [
      {
        status: 'EXPIRED',
        planName: 'Mensual',
        planType: 'MONTHLY',
        endDate: new Date('2026-10-01'),
        daysLeft: 0,
      },
      'Necesitas una membresía activa para reservar.',
    ],
    [
      {
        status: 'PENDING_PAYMENT',
        planName: 'Trimestral',
        planType: 'QUARTERLY',
        endDate: new Date('2026-12-30'),
        daysLeft: 30,
      },
      'Necesitas una membresía activa para reservar.',
    ],
    [
      {
        status: 'ACTIVE',
        planName: 'Clase suelta',
        planType: 'DROP_IN',
        endDate: new Date('2026-11-20'),
        daysLeft: 1,
      },
      'La clase suelta se compra en recepción y no permite reservar.',
    ],
  ])(
    'rechaza membresía %o con el mensaje esperado',
    async (membership, expectedMessage) => {
      const moduleRef = {
        get: vi.fn(() => ({
          currentFor: vi.fn().mockResolvedValue(membership),
        })),
      };
      const eligibility = new MembershipEligibilityService(
        moduleRef as unknown as ModuleRef,
      );

      await expect(eligibility.assertCanReserve(MEMBER_ID)).rejects.toThrow(
        expectedMessage,
      );
      expect(moduleRef.get).toHaveBeenCalledWith(MEMBERSHIP_STATUS_SERVICE, {
        strict: false,
      });
    },
  );

  it.each(['MONTHLY', 'QUARTERLY'] as const)(
    'permite reservar con membresía ACTIVE %s',
    async (planType) => {
      const moduleRef = {
        get: vi.fn(() => ({
          currentFor: vi.fn().mockResolvedValue({
            status: 'ACTIVE',
            planName: planType === 'MONTHLY' ? 'Mensual' : 'Trimestral',
            planType,
            endDate: new Date('2026-12-30'),
            daysLeft: 30,
          }),
        })),
      };
      const eligibility = new MembershipEligibilityService(
        moduleRef as unknown as ModuleRef,
      );

      await expect(
        eligibility.assertCanReserve(MEMBER_ID),
      ).resolves.toBeUndefined();
    },
  );
});

describe('ClassReservationsService', () => {
  let repository: {
    reserve: ReturnType<typeof vi.fn>;
    findByMember: ReturnType<typeof vi.fn>;
    cancelMine: ReturnType<typeof vi.fn>;
  };
  let membershipEligibility: {
    assertCanReserve: ReturnType<typeof vi.fn>;
  };
  let service: ClassReservationsService;

  beforeEach(() => {
    repository = {
      reserve: vi.fn(),
      findByMember: vi.fn(),
      cancelMine: vi.fn(),
    };
    membershipEligibility = {
      assertCanReserve: vi.fn().mockResolvedValue(undefined),
    };
    service = new ClassReservationsService(
      repository as unknown as ClassReservationRepository,
      membershipEligibility as unknown as MembershipEligibilityService,
    );
  });

  it('reserva un cupo cuando la membresía es elegible y el repositorio confirma', async () => {
    const created = sampleReservation();
    repository.reserve.mockResolvedValue(created);

    await expect(service.reserve(1, MEMBER_ID)).resolves.toEqual(created);
    expect(membershipEligibility.assertCanReserve).toHaveBeenCalledWith(
      MEMBER_ID,
    );
    expect(repository.reserve).toHaveBeenCalledWith(1, MEMBER_ID);
  });

  it('devuelve 503 si falta el proveedor real de membresías', async () => {
    const eligibility = new MembershipEligibilityService({
      get: vi.fn(() => {
        throw new Error('missing');
      }),
    } as unknown as ModuleRef);
    const localService = new ClassReservationsService(
      repository as unknown as ClassReservationRepository,
      eligibility,
    );

    await expect(localService.reserve(1, MEMBER_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it('devuelve 403 si la membresía es DROP_IN o inactiva', async () => {
    const dropInEligibility = new MembershipEligibilityService({
      get: vi.fn(() => ({
        currentFor: vi.fn().mockResolvedValue({
          status: 'ACTIVE',
          planName: 'Clase suelta',
          planType: 'DROP_IN',
          endDate: new Date(),
          daysLeft: 1,
        }),
      })),
    } as unknown as ModuleRef);
    const localService = new ClassReservationsService(
      repository as unknown as ClassReservationRepository,
      dropInEligibility,
    );

    const err = await localService
      .reserve(1, MEMBER_ID)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toBe(
      'La clase suelta se compra en recepción y no permite reservar.',
    );
  });

  it('devuelve 409 con code CLASS_FULL cuando la clase está llena', async () => {
    repository.reserve.mockRejectedValue(new ClassFullError(1));

    const error = await service.reserve(1, MEMBER_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      statusCode: 409,
      code: CLASS_FULL_CODE,
      message: CLASS_FULL_MESSAGE,
    });
  });

  it('devuelve 409 cuando ya tiene una reserva CONFIRMED', async () => {
    repository.reserve.mockRejectedValue(new AlreadyReservedError(1, MEMBER_ID));

    await expect(service.reserve(1, MEMBER_ID)).rejects.toThrow(
      new ConflictException(ALREADY_RESERVED_MESSAGE),
    );
  });

  it.each([
    [new ClassNotFoundError(1), NotFoundException, CLASS_NOT_FOUND_MESSAGE],
    [
      new ClassNotScheduledError(1),
      ConflictException,
      RESERVATION_NOT_SCHEDULED_MESSAGE,
    ],
    [
      new ClassAlreadyStartedError(1),
      ConflictException,
      'No se puede reservar una clase que ya comenzó.',
    ],
  ])(
    'traduce %s al error HTTP correspondiente',
    async (domainError, HttpError, message) => {
      repository.reserve.mockRejectedValue(domainError);

      const error = await service
        .reserve(1, MEMBER_ID)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpError);
      expect((error as Error).message).toBe(message);
    },
  );

  it('rechaza ids fuera de rango INT4 sin consultar Prisma', async () => {
    await expect(service.reserve(0, MEMBER_ID)).rejects.toThrow(
      new NotFoundException(CLASS_NOT_FOUND_MESSAGE),
    );
    await expect(service.reserve(2_147_483_648, MEMBER_ID)).rejects.toThrow(
      new NotFoundException(CLASS_NOT_FOUND_MESSAGE),
    );
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it('devuelve la reserva cancelada y solo usa el miembro autenticado', async () => {
    const cancelled = {
      ...sampleReservation(),
      status: 'CANCELLED' as const,
      cancelledAt: new Date(),
    };
    repository.cancelMine.mockResolvedValue(cancelled);
    await expect(service.cancelMine(10, MEMBER_ID)).resolves.toEqual(cancelled);
    expect(repository.cancelMine).toHaveBeenCalledWith(10, MEMBER_ID);
  });

  it.each([
    ['NOT_FOUND', NotFoundException, 'La reserva no existe.'],
    ['TOO_LATE', ConflictException, 'Solo puedes cancelar hasta 2 horas antes de la clase.'],
    ['DROP_IN', ForbiddenException, 'La clase suelta no se puede cancelar.'],
  ] as const)('mapea %s al error HTTP esperado', async (result, HttpError, message) => {
    repository.cancelMine.mockResolvedValue(result);
    await expect(service.cancelMine(10, MEMBER_ID)).rejects.toThrow(HttpError);
    await expect(service.cancelMine(10, MEMBER_ID)).rejects.toThrow(message);
  });
});
