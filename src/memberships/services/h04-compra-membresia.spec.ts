import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ChargesService, PaymentsService } from '@Common/contracts';
import { ClassFullError } from '@Classes/errors';
import type { ClassReservationRepository } from '@Classes/repositories';
import {
  MembershipRepository,
  type PlanRepository,
} from '@Memberships/repositories';
import { MembershipsService } from './memberships.service.js';
import { computeCurrentMembership } from './membership-status.js';
import { endOfGymDay } from './membership-dates.js';

// 19 nov 2026 a mediodía en El Salvador.
const NOW = new Date('2026-11-19T18:00:00.000Z');
const TODAY = '2026-11-19';
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const monthlyPlan = {
  id: 1,
  name: 'Mensual',
  type: 'MONTHLY',
  durationDays: 30,
  price: { toNumber: () => 25 },
  isActive: true,
};
const dropInPlan = {
  id: 3,
  name: 'Clase suelta',
  type: 'DROP_IN',
  durationDays: null,
  price: { toNumber: () => 5 },
  isActive: true,
};

/** Repositorio real con una transacción simulada que registra lo que se guarda. */
function realRepository(previous: object[]) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: MEMBER_ID }]),
    membership: {
      findMany: vi.fn().mockResolvedValue(previous),
      create: vi.fn(async ({ data }) => ({ id: 12, ...data })),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, repository: new MembershipRepository(prisma as never) };
}

function service(
  membershipRepository: unknown,
  extra: Partial<Record<string, unknown>> = {},
) {
  const charges = {
    createPending: vi.fn().mockResolvedValue({ chargeId: 34 }),
  };
  const payments = {
    payInTransaction: vi
      .fn()
      .mockResolvedValue({
        kind: 'APPROVED',
        receiptId: 1,
        receiptNumber: 'C-000001',
        amount: 5,
      }),
  };
  const planRepository = {
    findById: vi.fn().mockResolvedValue(monthlyPlan),
    findActiveDropIn: vi.fn().mockResolvedValue(dropInPlan),
  };
  const reservations = {
    reserveInTransaction: vi.fn().mockResolvedValue({
      id: 87,
      classId: 4,
      gymClass: {
        name: 'Spinning',
        startsAt: new Date('2026-11-19T23:00:00.000Z'),
      },
    }),
  };
  const svc = new MembershipsService(
    membershipRepository as MembershipRepository,
    planRepository as unknown as PlanRepository,
    charges as unknown as ChargesService,
    payments as unknown as PaymentsService,
    reservations as unknown as ClassReservationRepository,
  );
  return { svc, charges, payments, planRepository, reservations, ...extra };
}

/** Simula la transacción de la clase suelta ejecutando sus pasos en orden. */
const dropInRepository = {
  sellDropIn: vi.fn(async (data, steps) => {
    const reservation = await steps.reserve('tx');
    const membership = {
      id: 20,
      memberId: data.memberId,
      startDate: new Date(`${data.today}T00:00:00Z`),
      endDate: new Date(`${data.today}T00:00:00Z`),
      status: 'ACTIVE',
    };
    const { chargeId } = await steps.charge('tx', membership);
    const payment = await steps.pay('tx', chargeId);
    return { membership, reservation, payment };
  }),
};

const snapshot = (o: object = {}) => ({
  planName: 'Mensual',
  planType: 'MONTHLY' as const,
  startDate: '2026-11-10',
  endDate: '2026-12-09',
  paid: true,
  ...o,
});

describe('H04. Registrar la compra o renovación de una membresía', () => {
  it('AC1: registra la compra con su vencimiento calculado, en Pendiente de pago y con su cobro Pendiente', async () => {
    const { tx, repository } = realRepository([]);
    const { svc, charges } = service(repository);

    await svc.purchase({ memberId: MEMBER_ID, planId: 1 }, 'recepcion-1', NOW);

    const saved = tx.membership.create.mock.calls[0][0].data;
    expect(saved.status).toBe('PENDING_PAYMENT');
    expect(saved.startDate.toISOString().slice(0, 10)).toBe(TODAY);
    expect(saved.endDate.toISOString().slice(0, 10)).toBe('2026-12-18');
    expect(charges.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MEMBERSHIP',
        amount: 25,
        membershipId: 12,
      }),
      tx,
    );
  });

  it('AC2: en cuanto su cobro está pagado, la membresía se ve Activa', () => {
    expect(
      computeCurrentMembership([snapshot({ paid: false })], TODAY).status,
    ).toBe('PENDING_PAYMENT');
    expect(
      computeCurrentMembership([snapshot({ paid: true })], TODAY).status,
    ).toBe('ACTIVE');
  });

  it('AC3: la renovación de una membresía activa inicia el día siguiente al vencimiento actual', async () => {
    const current = {
      planType: 'MONTHLY',
      endDate: new Date('2026-12-08T00:00:00Z'),
      status: 'ACTIVE',
      charge: { status: 'PAID' },
    };
    const { tx, repository } = realRepository([current]);
    const { svc } = service(repository);

    await svc.purchase({ memberId: MEMBER_ID, planId: 1 }, 'recepcion-1', NOW);

    const saved = tx.membership.create.mock.calls[0][0].data;
    expect(saved.startDate.toISOString().slice(0, 10)).toBe('2026-12-09');
    expect(saved.isRenewal).toBe(true);
  });

  it('AC4: la clase suelta ocupa una clase de hoy, se cobra en el momento y queda Activa solo por hoy', async () => {
    const { svc, payments, reservations } = service(dropInRepository);

    await svc.sellDropIn(
      {
        memberId: MEMBER_ID,
        classId: 4,
        paymentMethod: 'CASH',
        idempotencyKey: 'k-1',
      },
      'recepcion-1',
      NOW,
    );

    expect(reservations.reserveInTransaction).toHaveBeenCalledWith(
      'tx',
      4,
      MEMBER_ID,
      { now: NOW, origin: 'DROP_IN' },
    );
    expect(payments.payInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'CASH' }),
      'tx',
    );
    const dropIn = computeCurrentMembership(
      [
        snapshot({
          planName: 'Clase suelta',
          planType: 'DROP_IN',
          startDate: TODAY,
          endDate: TODAY,
        }),
      ],
      TODAY,
    );
    expect(dropIn).toMatchObject({
      status: 'ACTIVE',
      daysLeft: 0,
      endDate: endOfGymDay(TODAY),
    });
  });

  it('AC5: si la clase ya no tiene cupo no cobra y responde "La clase está llena."', async () => {
    const { svc, payments, reservations } = service(dropInRepository);
    reservations.reserveInTransaction.mockRejectedValue(new ClassFullError(4));

    const attempt = svc.sellDropIn(
      {
        memberId: MEMBER_ID,
        classId: 4,
        paymentMethod: 'CASH',
        idempotencyKey: 'k-2',
      },
      'recepcion-1',
      NOW,
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow('La clase está llena.');
    expect(payments.payInTransaction).not.toHaveBeenCalled();
  });

  it('AC6: una membresía cuya fecha de vencimiento ya pasó se ve Vencida sin que nadie la actualice', () => {
    expect(
      computeCurrentMembership([snapshot({ endDate: '2026-11-18' })], TODAY),
    ).toMatchObject({ status: 'EXPIRED', daysLeft: null });
  });

  it('AC7: no registra con un plan desactivado ni con fecha de inicio anterior a hoy, y muestra el motivo', async () => {
    const repository = { purchase: vi.fn() };
    const { svc, planRepository } = service(repository);

    await expect(
      svc.purchase(
        { memberId: MEMBER_ID, planId: 1, startDate: '2026-11-18' },
        'r',
        NOW,
      ),
    ).rejects.toThrow('La fecha de inicio no puede ser anterior a hoy.');
    planRepository.findById.mockResolvedValue({
      ...monthlyPlan,
      isActive: false,
    });
    const inactive = svc.purchase({ memberId: MEMBER_ID, planId: 1 }, 'r', NOW);
    await expect(inactive).rejects.toBeInstanceOf(BadRequestException);
    await expect(inactive).rejects.toThrow(
      'El plan está desactivado y ya no se vende.',
    );
    expect(repository.purchase).not.toHaveBeenCalled();
  });
});
