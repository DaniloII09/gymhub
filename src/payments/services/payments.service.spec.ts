import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CHARGE_ALREADY_PAID_MESSAGE,
  CHARGE_NOT_FOUND_MESSAGE,
  MISSING_CARD_MESSAGE,
  PaymentsService,
  type MembershipStatusLookup,
  type PaymentGatewayService,
} from '@Payments/services';
import {
  ChargeAlreadyPaidError,
  ChargeNotFoundError,
  IdempotencyKeyReusedError,
  InvalidCardError,
} from '@Payments/errors';
import type {
  ApprovedPayment,
  PayChargeData,
  PaymentRepository,
} from '@Payments/repositories';
import type { CreatePaymentDto } from '@Payments/dto';

const RECEPTION_ID = '22222222-2222-2222-2222-222222222222';
const MEMBER_ID = '11111111-1111-1111-1111-111111111111';
const KEY = '3f1c2a9e-7b4d-4c1a-9a6e-1d2b3c4d5e6f';
const CARD = {
  cardNumber: '4242424242424242',
  holderName: 'Ana Pérez',
  expiry: '12/30',
  cvv: '123',
};

const approved: ApprovedPayment = {
  paymentId: 10,
  chargeId: 1,
  chargeType: 'MEMBERSHIP',
  memberId: MEMBER_ID,
  concept: 'Membresía Mensual',
  amount: 25,
  method: 'CASH',
  cardLast4: null,
  receiptId: 3,
  receiptNumber: 'C-000003',
  issuedAt: new Date('2026-11-08T15:00:00Z'),
};

describe('PaymentsService', () => {
  let repository: { pay: ReturnType<typeof vi.fn> };
  let gateway: { charge: ReturnType<typeof vi.fn> };
  let membershipStatus: { statusFor: ReturnType<typeof vi.fn> };
  let service: PaymentsService;

  beforeEach(() => {
    repository = { pay: vi.fn() };
    gateway = { charge: vi.fn() };
    membershipStatus = { statusFor: vi.fn().mockResolvedValue(null) };
    service = new PaymentsService(
      repository as unknown as PaymentRepository,
      gateway as unknown as PaymentGatewayService,
      membershipStatus as unknown as MembershipStatusLookup,
    );
  });

  const dto = (
    overrides: Partial<CreatePaymentDto> = {},
  ): CreatePaymentDto => ({
    chargeId: 1,
    paymentMethod: 'CASH',
    idempotencyKey: KEY,
    ...overrides,
  });

  /** Ejecuta la función `authorize` que el servicio le pasó al repositorio. */
  const runAuthorize = async (amount: number) => {
    const data = repository.pay.mock.calls[0][0] as PayChargeData;
    return data.authorize(amount);
  };

  it('en efectivo aprueba sin llamar a la pasarela', async () => {
    repository.pay.mockResolvedValue({ kind: 'APPROVED', payment: approved });

    await expect(service.pay(dto(), RECEPTION_ID)).resolves.toEqual(approved);

    expect(repository.pay).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeId: 1,
        method: 'CASH',
        idempotencyKey: KEY,
        registeredById: RECEPTION_ID,
      }),
    );
    await expect(runAuthorize(25)).resolves.toEqual({
      result: 'APPROVED',
      declineReason: null,
      cardLast4: null,
    });
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('con tarjeta autoriza por la pasarela con el monto del cobro guardado', async () => {
    repository.pay.mockResolvedValue({ kind: 'APPROVED', payment: approved });
    gateway.charge.mockResolvedValue({
      result: 'APPROVED',
      declineReason: null,
      cardLast4: '4242',
    });

    await service.pay(dto({ paymentMethod: 'CARD', card: CARD }), RECEPTION_ID);
    await runAuthorize(15);

    expect(gateway.charge).toHaveBeenCalledWith(CARD, 15);
  });

  it('con tarjeta y sin datos responde 400 sin tocar el repositorio', async () => {
    await expect(
      service.pay(dto({ paymentMethod: 'CARD' }), RECEPTION_ID),
    ).rejects.toThrow(new BadRequestException(MISSING_CARD_MESSAGE));
    expect(repository.pay).not.toHaveBeenCalled();
  });

  it('una tarjeta rechazada responde 400 con el motivo', async () => {
    repository.pay.mockResolvedValue({
      kind: 'DECLINED',
      declineReason: 'Fondos insuficientes',
    });

    const error = await service
      .pay(dto({ paymentMethod: 'CARD', card: CARD }), RECEPTION_ID)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: 'Fondos insuficientes',
      declineReason: 'Fondos insuficientes',
    });
  });

  it.each([
    [new ChargeNotFoundError(1), NotFoundException, CHARGE_NOT_FOUND_MESSAGE],
    [
      new ChargeAlreadyPaidError(1),
      ConflictException,
      CHARGE_ALREADY_PAID_MESSAGE,
    ],
    [new IdempotencyKeyReusedError(KEY), BadRequestException, undefined],
  ])(
    'traduce %s a su respuesta HTTP',
    async (domainError, HttpError, message) => {
      repository.pay.mockRejectedValue(domainError);

      const error = await service
        .pay(dto(), RECEPTION_ID)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpError);
      if (message) expect((error as Error).message).toBe(message);
    },
  );

  describe('payCardAsMember (H16)', () => {
    const cardPayment = { card: CARD, idempotencyKey: KEY };

    it('paga con tarjeta exigiendo que el cobro sea del miembro', async () => {
      repository.pay.mockResolvedValue({
        kind: 'APPROVED',
        payment: { ...approved, method: 'CARD', cardLast4: '4242' },
      });
      gateway.charge.mockResolvedValue({
        result: 'APPROVED',
        declineReason: null,
        cardLast4: '4242',
      });

      await service.payCardAsMember(MEMBER_ID, 1, cardPayment);
      await runAuthorize(25);

      expect(repository.pay).toHaveBeenCalledWith(
        expect.objectContaining({
          chargeId: 1,
          method: 'CARD',
          idempotencyKey: KEY,
          registeredById: MEMBER_ID,
          ownerId: MEMBER_ID,
        }),
      );
      expect(gateway.charge).toHaveBeenCalledWith(CARD, 25);
    });

    it('en un cobro de membresía informa el estado de la membresía', async () => {
      repository.pay.mockResolvedValue({ kind: 'APPROVED', payment: approved });
      membershipStatus.statusFor.mockResolvedValue('ACTIVE');

      const result = await service.payCardAsMember(MEMBER_ID, 1, cardPayment);

      expect(result.membershipStatus).toBe('ACTIVE');
      expect(membershipStatus.statusFor).toHaveBeenCalledWith(MEMBER_ID);
    });

    it('en otros cobros no consulta la membresía', async () => {
      repository.pay.mockResolvedValue({
        kind: 'APPROVED',
        payment: { ...approved, chargeType: 'PERSONAL_SESSION' },
      });

      const result = await service.payCardAsMember(MEMBER_ID, 1, cardPayment);

      expect(result.membershipStatus).toBeNull();
      expect(membershipStatus.statusFor).not.toHaveBeenCalled();
    });

    it('un cobro de otro miembro responde 404 "No encontramos ese cobro."', async () => {
      repository.pay.mockRejectedValue(new ChargeNotFoundError(1));

      await expect(
        service.payCardAsMember(MEMBER_ID, 1, cardPayment),
      ).rejects.toThrow(new NotFoundException(CHARGE_NOT_FOUND_MESSAGE));
    });

    it('un cobro ya pagado responde 409 "Este cobro ya está pagado."', async () => {
      repository.pay.mockRejectedValue(new ChargeAlreadyPaidError(1));

      await expect(
        service.payCardAsMember(MEMBER_ID, 1, cardPayment),
      ).rejects.toThrow(new ConflictException(CHARGE_ALREADY_PAID_MESSAGE));
    });

    it('una tarjeta rechazada responde 400 con el motivo', async () => {
      repository.pay.mockResolvedValue({
        kind: 'DECLINED',
        declineReason: 'Fondos insuficientes',
      });

      const error = await service
        .payCardAsMember(MEMBER_ID, 1, cardPayment)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: 'Fondos insuficientes',
      });
    });

    it('un id fuera del rango de la columna responde 404 sin consultar', async () => {
      await expect(
        service.payCardAsMember(MEMBER_ID, 2_147_483_648, cardPayment),
      ).rejects.toThrow(NotFoundException);
      expect(repository.pay).not.toHaveBeenCalled();
    });
  });

  describe('payInTransaction (contrato PAYMENTS_SERVICE, H04)', () => {
    const TX = 'tx' as never;
    const input = {
      chargeId: 7,
      method: 'CASH' as const,
      idempotencyKey: KEY,
      registeredById: RECEPTION_ID,
    };

    beforeEach(() => {
      (repository as unknown as { payInTransaction: ReturnType<typeof vi.fn> }).payInTransaction =
        vi.fn().mockImplementation(async (_tx, data: PayChargeData) => {
          const authorization = await data.authorize(5);
          return authorization.result === 'DECLINED'
            ? { kind: 'DECLINED', declineReason: authorization.declineReason }
            : { kind: 'APPROVED', payment: { ...approved, chargeId: 7, amount: 5 } };
        });
    });

    it('en efectivo aprueba sin pasar por la pasarela y devuelve el comprobante', async () => {
      await expect(service.payInTransaction(input, TX)).resolves.toEqual({
        kind: 'APPROVED',
        receiptId: 3,
        receiptNumber: 'C-000003',
        amount: 5,
      });
      expect(gateway.charge).not.toHaveBeenCalled();
    });

    it('con tarjeta cobra el monto del cobro por la pasarela y devuelve el rechazo', async () => {
      gateway.charge.mockResolvedValue({
        result: 'DECLINED',
        declineReason: 'Fondos insuficientes',
        cardLast4: '0002',
      });
      await expect(
        service.payInTransaction({ ...input, method: 'CARD', card: CARD }, TX),
      ).resolves.toEqual({ kind: 'DECLINED', declineReason: 'Fondos insuficientes' });
      expect(gateway.charge).toHaveBeenCalledWith(CARD, 5);
    });

    it('una tarjeta con datos no válidos vuelve como rechazo con el motivo', async () => {
      gateway.charge.mockRejectedValue(new InvalidCardError('Tarjeta vencida'));
      await expect(
        service.payInTransaction({ ...input, method: 'CARD', card: CARD }, TX),
      ).resolves.toEqual({ kind: 'DECLINED', declineReason: 'Tarjeta vencida' });
    });

    it('con tarjeta sin datos vuelve como rechazo', async () => {
      await expect(service.payInTransaction({ ...input, method: 'CARD' }, TX)).resolves.toEqual({
        kind: 'DECLINED',
        declineReason: MISSING_CARD_MESSAGE,
      });
    });
  });
});
