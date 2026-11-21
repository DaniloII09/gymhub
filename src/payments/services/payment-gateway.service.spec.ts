import {
  EXPIRED_CARD_MESSAGE,
  INSUFFICIENT_FUNDS_MESSAGE,
  INVALID_TEST_CARD_MESSAGE,
  PaymentGatewayService,
} from '@Payments/services';
import { InvalidCardError } from '@Payments/errors';

/** Un vencimiento siempre vigente: el mes actual dentro de dos años. */
function futureExpiry(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String((now.getFullYear() + 2) % 100).padStart(2, '0');
  return `${month}/${year}`;
}

const card = (cardNumber: string, overrides: object = {}) => ({
  cardNumber,
  holderName: 'Ana Pérez',
  expiry: futureExpiry(),
  cvv: '123',
  ...overrides,
});

describe('PaymentGatewayService', () => {
  let gateway: PaymentGatewayService;

  beforeEach(() => {
    gateway = new PaymentGatewayService();
    gateway.delayMs = 0;
  });

  it('la tarjeta 4242 aprueba después de 2 segundos', async () => {
    gateway.delayMs = 2000;
    const start = Date.now();

    const result = await gateway.charge(card('4242 4242 4242 4242'), 25);

    expect(Date.now() - start).toBeGreaterThanOrEqual(1990);
    expect(result).toEqual({
      result: 'APPROVED',
      declineReason: null,
      cardLast4: '4242',
    });
  }, 10_000);

  it('la tarjeta 0002 rechaza con "Fondos insuficientes"', async () => {
    const result = await gateway.charge(card('4000000000000002'), 25);

    expect(result).toEqual({
      result: 'DECLINED',
      declineReason: INSUFFICIENT_FUNDS_MESSAGE,
      cardLast4: '0002',
    });
  });

  it('cualquier otro número rechaza con "Tarjeta no válida para pruebas"', async () => {
    const result = await gateway.charge(card('5555555555554444'), 25);

    expect(result.declineReason).toBe(INVALID_TEST_CARD_MESSAGE);
  });

  it('una tarjeta vencida rechaza con "Tarjeta vencida"', async () => {
    const result = await gateway.charge(
      card('4242424242424242', { expiry: '01/20' }),
      25,
    );

    expect(result).toEqual({
      result: 'DECLINED',
      declineReason: EXPIRED_CARD_MESSAGE,
      cardLast4: '4242',
    });
  });

  it.each([
    ['número corto', { cardNumber: '4242' }],
    ['titular muy corto', { holderName: 'Al' }],
    ['vencimiento sin formato', { expiry: '13/30' }],
    ['CVV de 2 dígitos', { cvv: '12' }],
  ])('rechaza datos inválidos: %s', async (_case, overrides) => {
    await expect(
      gateway.charge(card('4242424242424242', overrides), 25),
    ).rejects.toBeInstanceOf(InvalidCardError);
  });

  it('no escribe el número completo en los logs ni en los errores', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );

    await gateway.charge(card('4242424242424242'), 25);
    const error = await gateway
      .charge(card('4242424242424242', { cvv: '1' }), 25)
      .then(
        () => null,
        (e: Error) => e,
      );

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('4242424242424242');
      spy.mockRestore();
    }
    expect(error?.message).not.toContain('4242424242424242');
  });
});
