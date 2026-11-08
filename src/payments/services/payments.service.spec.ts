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
  type PaymentGatewayService,
} from '@Payments/services';
import {
  ChargeAlreadyPaidError,
  ChargeNotFoundError,
  IdempotencyKeyReusedError,
} from '@Payments/errors';
import type {
  ApprovedPayment,
  PayChargeData,
  PaymentRepository,
} from '@Payments/repositories';
import type { CreatePaymentDto } from '@Payments/dto';

const RECEPTION_ID = '22222222-2222-2222-2222-222222222222';
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
  let service: PaymentsService;

  beforeEach(() => {
    repository = { pay: vi.fn() };
    gateway = { charge: vi.fn() };
    service = new PaymentsService(
      repository as unknown as PaymentRepository,
      gateway as unknown as PaymentGatewayService,
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
});
