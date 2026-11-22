import { BadRequestException, ConflictException } from '@nestjs/common';
import { ChargesController, PaymentsController } from '@Payments/controllers';
import {
  CHARGE_ALREADY_PAID_MESSAGE,
  ReceiptsService,
} from '@Payments/services';
import type { ReceiptRepository } from '@Payments/repositories';
import { MembershipRepository } from '@Memberships/repositories';
import { computeCurrentMembership } from '@Memberships/services';
import { PersonalSessionRepository } from '@Trainers/repositories';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';
import {
  APPROVED_CARD,
  DECLINED_CARD,
  MEMBER_ID,
  RECEPTION_ID,
  paymentFixture,
} from '../../../test/helpers/payment-fixture.js';

const KEY_1 = '3f1c2a9e-7b4d-4c1a-9a6e-1d2b3c4d5e61';
const KEY_2 = '3f1c2a9e-7b4d-4c1a-9a6e-1d2b3c4d5e62';

describe('H15. Registrar un pago en recepción', () => {
  it('AC1: en efectivo el cobro pasa a Pagado y hay comprobante único descargable en PDF', async () => {
    const { db, service } = paymentFixture([
      {},
      { concept: 'Sesión personal', type: 'PERSONAL_SESSION' },
    ]);

    const first = await service.pay(
      { chargeId: 1, paymentMethod: 'CASH', idempotencyKey: KEY_1 },
      RECEPTION_ID,
    );
    const second = await service.pay(
      { chargeId: 2, paymentMethod: 'CASH', idempotencyKey: KEY_2 },
      RECEPTION_ID,
    );

    expect(db.charges[0].status).toBe('PAID');
    expect(first).toMatchObject({
      method: 'CASH',
      amount: 25,
      receiptNumber: 'C-000007',
    });
    expect(second.receiptNumber).toBe('C-000008');

    const receipts = {
      findDetail: vi.fn().mockResolvedValue({
        id: first.receiptId,
        number: first.receiptNumber,
        issuedAt: first.issuedAt,
        memberId: MEMBER_ID,
        memberEmail: 'miembro@gymhub.test',
        concept: first.concept,
        amount: first.amount,
        method: 'CASH',
        cardLast4: null,
      }),
    };
    const pdf = await new ReceiptsService(
      receipts as unknown as ReceiptRepository,
    ).getPdf(first.receiptId, { id: RECEPTION_ID, role: 'RECEPTION' });
    expect(pdf.number).toBe('C-000007');
    expect(pdf.pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('AC2: con tarjeta pasa por la pasarela: la que aprueba paga y la que rechaza deja Pendiente con el motivo', async () => {
    const { db, service } = paymentFixture([{}, {}]);

    const ok = await service.pay(
      {
        chargeId: 1,
        paymentMethod: 'CARD',
        card: APPROVED_CARD,
        idempotencyKey: KEY_1,
      },
      RECEPTION_ID,
    );
    expect(ok).toMatchObject({ method: 'CARD', cardLast4: '4242' });
    expect(db.charges[0].status).toBe('PAID');

    const error = await service
      .pay(
        {
          chargeId: 2,
          paymentMethod: 'CARD',
          card: DECLINED_CARD,
          idempotencyKey: KEY_2,
        },
        RECEPTION_ID,
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      declineReason: 'Fondos insuficientes',
    });
    expect(db.charges[1].status).toBe('PENDING');
    expect(db.payments.at(-1)).toMatchObject({
      chargeId: 2,
      result: 'DECLINED',
    });
  });

  it('AC3: al pagar el cobro de una membresía, la membresía pasa a Activa', async () => {
    const { db, service } = paymentFixture();
    await service.pay(
      { chargeId: 1, paymentMethod: 'CASH', idempotencyKey: KEY_1 },
      RECEPTION_ID,
    );

    // La membresía lee el estado de su cobro (contrato membership-status).
    const prisma = {
      membership: {
        findMany: vi.fn().mockResolvedValue([
          {
            planType: 'MONTHLY',
            startDate: new Date('2026-11-19T00:00:00.000Z'),
            endDate: new Date('2026-12-18T00:00:00.000Z'),
            status: 'PENDING_PAYMENT',
            plan: { name: 'Mensual' },
            charge: { status: db.charges[0].status },
          },
        ]),
      },
    };
    const snapshots = await new MembershipRepository(
      prisma as never,
    ).snapshotsFor(MEMBER_ID);
    expect(computeCurrentMembership(snapshots, '2026-11-19').status).toBe(
      'ACTIVE',
    );
  });

  it('AC4: al pagar una sesión personal, aparece pagada en la agenda del entrenador y en Mis sesiones', async () => {
    const { db, service } = paymentFixture([
      { type: 'PERSONAL_SESSION', concept: 'Sesión personal', amount: 15 },
    ]);
    await service.pay(
      { chargeId: 1, paymentMethod: 'CASH', idempotencyKey: KEY_1 },
      RECEPTION_ID,
    );

    const session = {
      id: 5,
      chargeId: 1,
      memberId: MEMBER_ID,
      member: {
        id: MEMBER_ID,
        fullName: 'Juan Perez',
        email: 'miembro@gymhub.test',
      },
      trainer: {
        id: 't',
        fullName: 'Entrenador',
        email: 'entrenador@gymhub.test',
      },
    };
    const prisma = {
      personalSession: { findMany: vi.fn().mockResolvedValue([session]) },
      charge: {
        findMany: vi.fn(async () =>
          db.charges.map((c) => ({ id: c.id, status: c.status })),
        ),
      },
    };
    const sessions = new PersonalSessionRepository(
      prisma as never,
      {} as never,
    );
    const agenda = await sessions.findUpcomingForTrainer(
      't',
      new Date(0),
      new Date(),
    );
    const mine = await sessions.findByMember(MEMBER_ID);
    expect(agenda[0].chargeStatus).toBe('PAID');
    expect(mine[0].chargeStatus).toBe('PAID');
  });

  it('AC5: un cobro ya pagado no se cobra dos veces, aunque se presione el botón dos veces', async () => {
    const { db, service } = paymentFixture();
    const dto = {
      chargeId: 1,
      paymentMethod: 'CASH' as const,
      idempotencyKey: KEY_1,
    };

    // Doble clic: la misma clave de idempotencia devuelve el mismo comprobante.
    const first = await service.pay(dto, RECEPTION_ID);
    const repeated = await service.pay(dto, RECEPTION_ID);
    expect(repeated.receiptNumber).toBe(first.receiptNumber);
    expect(db.payments).toHaveLength(1);

    // Un cobro nuevo sobre el cobro pagado.
    await expect(
      service.pay({ ...dto, idempotencyKey: KEY_2 }, RECEPTION_ID),
    ).rejects.toThrow(new ConflictException(CHARGE_ALREADY_PAID_MESSAGE));
    expect(CHARGE_ALREADY_PAID_MESSAGE).toBe('Este cobro ya está pagado.');
    expect(db.payments).toHaveLength(1);
  });

  it('AC6: Miembro y Entrenador no pueden usar la pantalla de cobro', () => {
    expect(rolesAllowed(PaymentsController, 'create')).toEqual([
      'ADMIN',
      'RECEPTION',
    ]);
    expect(rolesAllowed(ChargesController, 'listByMember')).toEqual([
      'ADMIN',
      'RECEPTION',
    ]);
    expect(rolesAllowed(ChargesController, 'searchMembers')).toEqual([
      'ADMIN',
      'RECEPTION',
    ]);
  });
});
