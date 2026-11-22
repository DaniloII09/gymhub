import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCheckInDto } from '@CheckIns/dto';
import {
  checkInFixture,
  MEMBER_ID,
} from '../../../test/helpers/check-in-fixture.js';

const juan = { id: MEMBER_ID, memberCode: 'GYM-000002', fullName: 'Ana Gomez' };

describe('H14. Recibir una alerta de membresía vencida al registrar un ingreso', () => {
  it('AC1: con membresía Vencida, Pendiente de pago o sin membresía avisa que no está vigente, con la próxima fecha de pago', async () => {
    for (const status of ['EXPIRED', 'PENDING_PAYMENT', 'NONE'] as const) {
      const endDate =
        status === 'NONE' ? null : new Date('2026-11-10T12:00:00Z');
      const { service } = checkInFixture({
        members: [juan],
        membership: { status, endDate },
      });
      const [found] = await service.lookup('GYM-000002');
      expect(found.accessAllowed).toBe(false);
      expect(found.nextPaymentDate).toBe(endDate ? '2026-11-10' : null);
    }
  });

  it('AC2: con membresía Activa, incluida una clase suelta de hoy, registra sin aviso ni motivo', async () => {
    for (const planType of ['MONTHLY', 'DROP_IN'] as const) {
      const { service, tx } = checkInFixture({
        membership: { status: 'ACTIVE', planType },
      });
      const result = await service.register(
        MEMBER_ID,
        'recepcion-1',
        new Date(),
      );
      expect(result.isException).toBe(false);
      expect(tx.checkIn.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isException: false,
          exceptionReason: null,
        }),
      });
    }
  });

  it('AC3: para dejarlo pasar exige un motivo de 5 a 200 caracteres que se guarda con el ingreso', async () => {
    const { service, tx } = checkInFixture({
      membership: { status: 'EXPIRED' },
    });
    const reason = 'Renovará al salir de la clase';

    const result = await service.register(
      MEMBER_ID,
      'recepcion-1',
      new Date(),
      reason,
    );

    expect(result.isException).toBe(true);
    expect(tx.checkIn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isException: true,
        exceptionReason: reason,
      }),
    });
    const tooShort = await validate(
      plainToInstance(CreateCheckInDto, {
        memberId: MEMBER_ID,
        exceptionReason: 'abc',
      }),
    );
    expect(tooShort.length).toBeGreaterThan(0);
  });

  it('AC4: sin motivo no registra el ingreso: "Escribe el motivo para dejarlo pasar."', async () => {
    const { service, tx } = checkInFixture({
      membership: { status: 'EXPIRED' },
    });

    const attempt = service.register(MEMBER_ID, 'recepcion-1', new Date());

    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(attempt).rejects.toThrow(
      'Escribe el motivo para dejarlo pasar.',
    );
    expect(tx.checkIn.create).not.toHaveBeenCalled();
  });
});
