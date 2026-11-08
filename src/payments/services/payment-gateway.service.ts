import { Injectable } from '@nestjs/common';
import { InvalidCardError } from '@Payments/errors';

/** Datos de la tarjeta tal como llegan del formulario. */
export interface CardData {
  /** 16 dígitos; se aceptan espacios. */
  cardNumber: string;
  /** 3 a 60 caracteres. */
  holderName: string;
  /** MM/AA. */
  expiry: string;
  /** 3 dígitos. */
  cvv: string;
}

export interface GatewayResult {
  result: 'APPROVED' | 'DECLINED';
  declineReason: string | null;
  cardLast4: string;
}

/** Tarjetas de prueba de la sección 2.3 del documento de historias. */
export const APPROVED_TEST_CARD = '4242424242424242';
export const DECLINED_TEST_CARD = '4000000000000002';
export const INSUFFICIENT_FUNDS_MESSAGE = 'Fondos insuficientes';
export const INVALID_TEST_CARD_MESSAGE = 'Tarjeta no válida para pruebas';
export const EXPIRED_CARD_MESSAGE = 'Tarjeta vencida';

/** Espera simulada de la pasarela, en milisegundos. */
export const GATEWAY_DELAY_MS = 2000;

/**
 * Pasarela de pago simulada (BE-15.3). La usan el pago en recepción (H15), la
 * venta de clase suelta (H04) y el pago en línea del miembro (H16).
 *
 * Regla de seguridad: no guarda ni escribe en logs el número completo ni el
 * CVV. Solo devuelve los últimos 4 dígitos.
 */
@Injectable()
export class PaymentGatewayService {
  /** Las pruebas lo bajan a 0 para no esperar 2 segundos en cada caso. */
  delayMs = GATEWAY_DELAY_MS;

  /**
   * @throws {InvalidCardError} si algún dato no tiene el formato esperado.
   */
  async charge(card: CardData, amount: number): Promise<GatewayResult> {
    const number = card.cardNumber.replace(/\s+/g, '');
    const expiry = this.parseExpiry(card.expiry.trim());

    if (!/^\d{16}$/.test(number)) {
      throw new InvalidCardError('El número de tarjeta debe tener 16 dígitos.');
    }
    const holder = card.holderName.trim();
    if (holder.length < 3 || holder.length > 60) {
      throw new InvalidCardError(
        'El nombre del titular debe tener entre 3 y 60 caracteres.',
      );
    }
    if (!expiry) {
      throw new InvalidCardError('El vencimiento debe tener el formato MM/AA.');
    }
    if (!/^\d{3}$/.test(card.cvv)) {
      throw new InvalidCardError('El CVV debe tener 3 dígitos.');
    }
    if (!(amount > 0)) {
      throw new InvalidCardError('El monto debe ser mayor que 0.');
    }

    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    const cardLast4 = number.slice(-4);
    if (this.isExpired(expiry)) {
      return {
        result: 'DECLINED',
        declineReason: EXPIRED_CARD_MESSAGE,
        cardLast4,
      };
    }
    if (number === APPROVED_TEST_CARD) {
      return { result: 'APPROVED', declineReason: null, cardLast4 };
    }
    if (number === DECLINED_TEST_CARD) {
      return {
        result: 'DECLINED',
        declineReason: INSUFFICIENT_FUNDS_MESSAGE,
        cardLast4,
      };
    }
    return {
      result: 'DECLINED',
      declineReason: INVALID_TEST_CARD_MESSAGE,
      cardLast4,
    };
  }

  private parseExpiry(value: string): { month: number; year: number } | null {
    const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value);
    return match
      ? { month: Number(match[1]), year: 2000 + Number(match[2]) }
      : null;
  }

  /** Una tarjeta 11/26 sigue vigente durante todo noviembre de 2026. */
  private isExpired({ month, year }: { month: number; year: number }): boolean {
    const now = new Date();
    return year * 12 + (month - 1) < now.getFullYear() * 12 + now.getMonth();
  }
}
