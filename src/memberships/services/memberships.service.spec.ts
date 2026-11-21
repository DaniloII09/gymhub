import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  DROP_IN_NOT_ALLOWED_MESSAGE,
  MEMBER_NOT_FOUND_MESSAGE,
  MembershipExpiryJob,
  MembershipStatusService,
  MembershipsService,
  PENDING_MEMBERSHIP_MESSAGE,
  PLAN_INACTIVE_MESSAGE,
  START_DATE_IN_PAST_MESSAGE,
  endOfGymDay,
} from '@Memberships/services';
import { MemberNotFoundError, PendingMembershipExistsError } from '@Memberships/errors';
import type { MembershipRepository, PlanRepository } from '@Memberships/repositories';
import type { ChargesService, PaymentsService } from '@Common/contracts';
import type { ClassReservationRepository } from '@Classes/repositories';
import {
  AlreadyReservedError,
  ClassAlreadyStartedError,
  ClassFullError,
  ClassNotFoundError,
  ClassNotScheduledError,
} from '@Classes/errors';
import { ClassNotTodayError, DropInPaymentDeclinedError } from '@Memberships/errors';
import {
  ALREADY_RESERVED_MESSAGE,
  CLASS_ALREADY_STARTED_MESSAGE,
  CLASS_CANCELLED_MESSAGE,
  CLASS_FULL_MESSAGE,
  CLASS_NOT_FOUND_MESSAGE,
  CLASS_NOT_TODAY_MESSAGE,
  NO_DROP_IN_PLAN_MESSAGE,
} from '@Memberships/services';
import { MISSING_DROP_IN_CARD_MESSAGE } from '@Memberships/dto';

// 19 nov 2026 a mediodía en El Salvador.
const NOW = new Date('2026-11-19T18:00:00.000Z');
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

const plan = (overrides: object = {}) => ({
  id: 1,
  name: 'Mensual',
  type: 'MONTHLY',
  durationDays: 30,
  price: { toNumber: () => 25 },
  isActive: true,
  ...overrides,
});

function build() {
  const membershipRepository = {
    purchase: vi.fn(),
    snapshotsFor: vi.fn().mockResolvedValue([]),
    expiringOn: vi.fn().mockResolvedValue([]),
    syncStatuses: vi.fn().mockResolvedValue({ activated: 0, expired: 0 }),
  };
  const planRepository = { findById: vi.fn().mockResolvedValue(plan()) };
  const charges = { createPending: vi.fn().mockResolvedValue({ chargeId: 34 }) };

  // purchase() ejecuta el callback del cobro como lo haría la transacción real.
  membershipRepository.purchase.mockImplementation(async (data, createCharge) => {
    const membership = {
      id: 12,
      memberId: data.memberId,
      startDate: new Date(`${data.requestedStart}T00:00:00.000Z`),
    };
    const { chargeId } = await createCharge('tx', membership);
    return { membership, chargeId };
  });

  const payments = {
    payInTransaction: vi
      .fn()
      .mockResolvedValue({ kind: 'APPROVED', receiptId: 1, receiptNumber: 'C-000001', amount: 5 }),
  };
  const reservations = {
    reserveInTransaction: vi.fn().mockResolvedValue({
      id: 87,
      classId: 4,
      gymClass: { name: 'Spinning', startsAt: new Date('2026-11-19T23:00:00.000Z') },
    }),
  };

  const service = new MembershipsService(
    membershipRepository as unknown as MembershipRepository,
    planRepository as unknown as PlanRepository,
    charges as unknown as ChargesService,
    payments as unknown as PaymentsService,
    reservations as unknown as ClassReservationRepository,
  );
  return { service, membershipRepository, planRepository, charges, payments, reservations };
}

describe('MembershipsService.purchase (BE-4.1)', () => {
  it('registra la compra con hoy como inicio por defecto y crea su cobro PENDING', async () => {
    const { service, membershipRepository, charges } = build();

    const { purchase } = await service.purchase({ memberId: MEMBER_ID, planId: 1 }, 'recep', NOW);

    expect(membershipRepository.purchase).toHaveBeenCalledWith(
      {
        memberId: MEMBER_ID,
        planId: 1,
        planType: 'MONTHLY',
        requestedStart: '2026-11-19',
        durationDays: 30,
        createdById: 'recep',
        today: '2026-11-19',
      },
      expect.any(Function),
    );
    expect(charges.createPending).toHaveBeenCalledWith(
      {
        memberId: MEMBER_ID,
        type: 'MEMBERSHIP',
        concept: 'Membresía Mensual',
        amount: 25,
        dueDate: new Date('2026-11-19T00:00:00.000Z'),
        membershipId: 12,
      },
      'tx',
    );
    expect(purchase.chargeId).toBe(34);
  });

  it('respeta una fecha de inicio futura', async () => {
    const { service, membershipRepository } = build();
    await service.purchase({ memberId: MEMBER_ID, planId: 1, startDate: '2026-12-01' }, 'r', NOW);
    expect(membershipRepository.purchase.mock.calls[0][0].requestedStart).toBe('2026-12-01');
  });

  it('rechaza con 400 una fecha de inicio anterior a hoy', async () => {
    const { service, membershipRepository } = build();
    await expect(
      service.purchase({ memberId: MEMBER_ID, planId: 1, startDate: '2026-11-18' }, 'r', NOW),
    ).rejects.toThrow(new BadRequestException(START_DATE_IN_PAST_MESSAGE));
    expect(membershipRepository.purchase).not.toHaveBeenCalled();
  });

  it('responde 404 si el plan no existe', async () => {
    const { service, planRepository } = build();
    planRepository.findById.mockResolvedValue(null);
    await expect(service.purchase({ memberId: MEMBER_ID, planId: 9 }, 'r', NOW)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rechaza con 400 un plan desactivado', async () => {
    const { service, planRepository } = build();
    planRepository.findById.mockResolvedValue(plan({ isActive: false }));
    await expect(service.purchase({ memberId: MEMBER_ID, planId: 1 }, 'r', NOW)).rejects.toThrow(
      new BadRequestException(PLAN_INACTIVE_MESSAGE),
    );
  });

  it('rechaza con 400 el plan de clase suelta', async () => {
    const { service, planRepository } = build();
    planRepository.findById.mockResolvedValue(plan({ type: 'DROP_IN', durationDays: null }));
    await expect(service.purchase({ memberId: MEMBER_ID, planId: 3 }, 'r', NOW)).rejects.toThrow(
      new BadRequestException(DROP_IN_NOT_ALLOWED_MESSAGE),
    );
  });

  it.each([
    [new MemberNotFoundError(MEMBER_ID), new NotFoundException(MEMBER_NOT_FOUND_MESSAGE)],
    [new PendingMembershipExistsError(MEMBER_ID), new ConflictException(PENDING_MEMBERSHIP_MESSAGE)],
  ])('traduce el error del repositorio %s', async (error, expected) => {
    const { service, membershipRepository } = build();
    membershipRepository.purchase.mockRejectedValue(error);
    await expect(service.purchase({ memberId: MEMBER_ID, planId: 1 }, 'r', NOW)).rejects.toThrow(
      expected,
    );
  });
});

describe('MembershipsService.sellDropIn (BE-4.2)', () => {
  const dropInPlan = plan({ id: 3, name: 'Clase suelta', type: 'DROP_IN', durationDays: null, price: { toNumber: () => 5 } });
  const dto = {
    memberId: MEMBER_ID,
    classId: 4,
    paymentMethod: 'CASH' as const,
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
  };

  /** Igual que la transacción real: corre los pasos en orden. */
  function withSteps(ctx: ReturnType<typeof build>) {
    (ctx.planRepository as unknown as { findActiveDropIn: ReturnType<typeof vi.fn> }).findActiveDropIn =
      vi.fn().mockResolvedValue(dropInPlan);
    (ctx.membershipRepository as unknown as { sellDropIn: ReturnType<typeof vi.fn> }).sellDropIn = vi
      .fn()
      .mockImplementation(async (_data, steps) => {
        const reservation = await steps.reserve('tx');
        const membership = { id: 15, memberId: MEMBER_ID, startDate: new Date('2026-11-19T00:00:00.000Z') };
        const { chargeId } = await steps.charge('tx', membership);
        const payment = await steps.pay('tx', chargeId);
        if (payment.kind === 'DECLINED') throw new DropInPaymentDeclinedError(payment.declineReason);
        return { membership, reservationId: reservation.reservationId, receiptNumber: payment.receiptNumber };
      });
    return ctx;
  }

  it('reserva con origen DROP_IN, cobra el precio del plan activo y lo paga en la misma transacción', async () => {
    const ctx = withSteps(build());
    const sale = await ctx.service.sellDropIn(dto, 'recep', NOW);

    expect(ctx.reservations.reserveInTransaction).toHaveBeenCalledWith('tx', 4, MEMBER_ID, {
      now: NOW,
      origin: 'DROP_IN',
    });
    expect(ctx.charges.createPending).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DROP_IN', amount: 5, membershipId: 15, concept: 'Clase suelta' }),
      'tx',
    );
    expect(ctx.payments.payInTransaction).toHaveBeenCalledWith(
      {
        chargeId: 34,
        method: 'CASH',
        card: undefined,
        idempotencyKey: dto.idempotencyKey,
        registeredById: 'recep',
      },
      'tx',
    );
    expect(sale).toMatchObject({ reservationId: 87, receiptNumber: 'C-000001' });
  });

  it('con tarjeta sin datos responde 400 sin tocar la base', async () => {
    const ctx = withSteps(build());
    await expect(ctx.service.sellDropIn({ ...dto, paymentMethod: 'CARD' }, 'r', NOW)).rejects.toThrow(
      new BadRequestException(MISSING_DROP_IN_CARD_MESSAGE),
    );
  });

  it('sin plan de clase suelta activo responde 400', async () => {
    const ctx = withSteps(build());
    (ctx.planRepository as unknown as { findActiveDropIn: ReturnType<typeof vi.fn> }).findActiveDropIn.mockResolvedValue(null);
    await expect(ctx.service.sellDropIn(dto, 'r', NOW)).rejects.toThrow(
      new BadRequestException(NO_DROP_IN_PLAN_MESSAGE),
    );
  });

  it('una tarjeta rechazada responde 400 con el motivo', async () => {
    const ctx = withSteps(build());
    ctx.payments.payInTransaction.mockResolvedValue({ kind: 'DECLINED', declineReason: 'Fondos insuficientes' });
    await expect(ctx.service.sellDropIn(dto, 'r', NOW)).rejects.toMatchObject({
      status: 400,
      response: { message: 'Fondos insuficientes', declineReason: 'Fondos insuficientes' },
    });
  });

  it.each([
    [new ClassFullError(4), new ConflictException(CLASS_FULL_MESSAGE)],
    [new ClassNotScheduledError(4), new ConflictException(CLASS_CANCELLED_MESSAGE)],
    [new ClassAlreadyStartedError(4), new ConflictException(CLASS_ALREADY_STARTED_MESSAGE)],
    [new AlreadyReservedError(4, MEMBER_ID), new ConflictException(ALREADY_RESERVED_MESSAGE)],
    [new ClassNotTodayError(4), new ConflictException(CLASS_NOT_TODAY_MESSAGE)],
    [new ClassNotFoundError(4), new NotFoundException(CLASS_NOT_FOUND_MESSAGE)],
    [new MemberNotFoundError(MEMBER_ID), new NotFoundException(MEMBER_NOT_FOUND_MESSAGE)],
  ])('traduce %s', async (error, expected) => {
    const ctx = withSteps(build());
    ctx.reservations.reserveInTransaction.mockRejectedValue(error);
    await expect(ctx.service.sellDropIn(dto, 'r', NOW)).rejects.toThrow(expected);
    expect(ctx.payments.payInTransaction).not.toHaveBeenCalled();
  });
});

describe('MembershipStatusService (contratos de BE-4.3 y H26)', () => {
  it('calcula el estado con la fecha del gimnasio', async () => {
    const repo = { snapshotsFor: vi.fn().mockResolvedValue([]), expiringOn: vi.fn() };
    const service = new MembershipStatusService(repo as unknown as MembershipRepository);
    await expect(service.currentFor(MEMBER_ID, NOW)).resolves.toMatchObject({ status: 'NONE' });
    expect(repo.snapshotsFor).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('entrega los vencimientos como el último instante del día', async () => {
    const row = {
      membershipId: 1,
      memberId: MEMBER_ID,
      planName: 'Mensual',
      planType: 'MONTHLY',
      endDate: '2026-11-24',
      renewed: false,
    };
    const repo = { snapshotsFor: vi.fn(), expiringOn: vi.fn().mockResolvedValue([row]) };
    const service = new MembershipStatusService(repo as unknown as MembershipRepository);
    await expect(service.expiringOn('2026-11-24')).resolves.toEqual([
      { ...row, endDate: endOfGymDay('2026-11-24') },
    ]);
  });
});

describe('MembershipExpiryJob (tarea de las 00:05)', () => {
  it('sincroniza con la fecha del gimnasio', async () => {
    const repo = { syncStatuses: vi.fn().mockResolvedValue({ activated: 1, expired: 2 }) };
    await new MembershipExpiryJob(repo as unknown as MembershipRepository).handle(NOW);
    expect(repo.syncStatuses).toHaveBeenCalledWith('2026-11-19', NOW);
  });

  it('si falla no lanza: la de mañana lo vuelve a intentar', async () => {
    const repo = { syncStatuses: vi.fn().mockRejectedValue(new Error('db caída')) };
    await expect(
      new MembershipExpiryJob(repo as unknown as MembershipRepository).handle(NOW),
    ).resolves.toBeUndefined();
  });
});
