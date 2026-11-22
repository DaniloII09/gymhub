import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MemberPaymentsController } from '@Payments/controllers';
import {
  CHARGE_ALREADY_PAID_MESSAGE,
  CHARGE_NOT_FOUND_MESSAGE,
  ChargesService,
  GATEWAY_DELAY_MS,
  type PaymentsService,
  type ReceiptsService,
} from '@Payments/services';
import type { ChargeRepository } from '@Payments/repositories';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';
import {
  APPROVED_CARD,
  DECLINED_CARD,
  MEMBER_ID,
  OTHER_MEMBER_ID,
  paymentFixture,
} from '../../../test/helpers/payment-fixture.js';

const KEY_1 = '9b1c2a9e-7b4d-4c1a-9a6e-1d2b3c4d5e61';
const KEY_2 = '9b1c2a9e-7b4d-4c1a-9a6e-1d2b3c4d5e62';

describe('H16. Pagar con tarjeta mi membresía o sesión personal', () => {
  it('AC1: en Mis pagos veo cada cobro pendiente con concepto, monto y vencimiento', async () => {
    const repository = {
      findByMember: vi.fn().mockResolvedValue([
        {
          id: 4,
          type: 'MEMBERSHIP',
          concept: 'Membresía Mensual',
          amount: { toString: () => '25.00', valueOf: () => 25 },
          dueDate: new Date('2026-11-19T00:00:00.000Z'),
          status: 'PENDING',
        },
      ]),
    };
    const controller = new MemberPaymentsController(
      new ChargesService(repository as unknown as ChargeRepository),
      {} as ReceiptsService,
      {} as PaymentsService,
    );

    const result = await controller.myCharges(
      { id: MEMBER_ID } as never,
      { status: 'PENDING' } as never,
    );

    // El id sale del token: solo se piden los cobros del miembro autenticado.
    expect(repository.findByMember).toHaveBeenCalledWith(MEMBER_ID, 'PENDING');
    expect(result.data).toEqual([
      {
        chargeId: 4,
        type: 'MEMBERSHIP',
        concept: 'Membresía Mensual',
        amount: 25,
        dueDate: '2026-11-19',
        status: 'PENDING',
      },
    ]);
    expect(rolesAllowed(MemberPaymentsController, 'myCharges')).toEqual([
      'MEMBER',
    ]);
  });

  it('AC2: con la tarjeta que aprueba el cobro queda Pagado, la membresía Activa y hay comprobante', async () => {
    const { db, service, membershipStatus } = paymentFixture();

    const result = await service.payCardAsMember(MEMBER_ID, 1, {
      card: APPROVED_CARD,
      idempotencyKey: KEY_1,
    });

    expect(db.charges[0].status).toBe('PAID');
    expect(result).toMatchObject({
      receiptNumber: 'C-000007',
      cardLast4: '4242',
      membershipStatus: 'ACTIVE',
    });
    expect(membershipStatus.statusFor).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('AC3: con la tarjeta que rechaza el cobro sigue Pendiente y veo el motivo', async () => {
    const { db, service } = paymentFixture();

    const error = await service
      .payCardAsMember(MEMBER_ID, 1, {
        card: DECLINED_CARD,
        idempotencyKey: KEY_1,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: 'Fondos insuficientes',
    });
    expect(db.charges[0].status).toBe('PENDING');
  });

  it('AC4: dos clics seguidos en Pagar registran un solo pago (la pasarela espera 2 s)', async () => {
    const { db, service } = paymentFixture();
    const body = { card: APPROVED_CARD, idempotencyKey: KEY_1 };

    const first = await service.payCardAsMember(MEMBER_ID, 1, body);
    const second = await service.payCardAsMember(MEMBER_ID, 1, body);

    expect(second.receiptNumber).toBe(first.receiptNumber);
    expect(db.payments).toHaveLength(1);
    expect(db.receipts).toHaveLength(1);
    // El botón deshabilitado durante la espera se prueba en la interfaz (caso manual).
    expect(GATEWAY_DELAY_MS).toBe(2000);
  });

  it('AC5: un cobro ya pagado no se puede pagar de nuevo: "Este cobro ya está pagado."', async () => {
    const { db, service } = paymentFixture([{ status: 'PAID' }]);

    await expect(
      service.payCardAsMember(MEMBER_ID, 1, {
        card: APPROVED_CARD,
        idempotencyKey: KEY_2,
      }),
    ).rejects.toThrow(new ConflictException('Este cobro ya está pagado.'));
    expect(CHARGE_ALREADY_PAID_MESSAGE).toBe('Este cobro ya está pagado.');
    expect(db.payments).toHaveLength(0);
  });

  it('AC6: el cobro de otro miembro no se puede pagar: "No encontramos ese cobro."', async () => {
    const { db, service } = paymentFixture([{ memberId: OTHER_MEMBER_ID }]);

    await expect(
      service.payCardAsMember(MEMBER_ID, 1, {
        card: APPROVED_CARD,
        idempotencyKey: KEY_1,
      }),
    ).rejects.toThrow(new NotFoundException('No encontramos ese cobro.'));
    expect(CHARGE_NOT_FOUND_MESSAGE).toBe('No encontramos ese cobro.');
    expect(db.charges[0].status).toBe('PENDING');
    expect(db.payments).toHaveLength(0);
  });
});
