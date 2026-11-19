import type { Prisma } from '@PrismaClient';

/**
 * Contrato de pagos (Épica 5 · Pagos, dueño: Jaime). Permite pagar un cobro
 * dentro de la transacción de otro módulo, con las mismas reglas que
 * POST /payments (BE-15.2): bloqueo del cobro, monto tomado del cobro guardado,
 * pasarela simulada para tarjeta, comprobante y cobro en PAID.
 *
 * Lo usa H04 para la clase suelta: el cupo, la membresía, la reserva, el cobro
 * y el pago se guardan juntos, o no se guarda nada.
 */
export interface PaymentCardInput {
  cardNumber: string;
  holderName: string;
  /** MM/AA */
  expiry: string;
  cvv: string;
}

export interface PayInTransactionInput {
  chargeId: number;
  method: 'CASH' | 'CARD';
  /** Obligatoria con CARD. */
  card?: PaymentCardInput;
  /** uuid que genera el cliente: la misma clave nunca cobra dos veces. */
  idempotencyKey: string;
  registeredById: string;
}

export type PayInTransactionResult =
  | { kind: 'APPROVED'; receiptId: number; receiptNumber: string; amount: number }
  /** La pasarela rechazó la tarjeta o sus datos no son válidos. */
  | { kind: 'DECLINED'; declineReason: string };

export interface PaymentsService {
  /**
   * Paga el cobro dentro de `tx`. Con DECLINED, quien llama decide qué hacer;
   * si revierte su transacción, el intento rechazado tampoco queda guardado.
   */
  payInTransaction(
    input: PayInTransactionInput,
    tx: Prisma.TransactionClient,
  ): Promise<PayInTransactionResult>;
}

export const PAYMENTS_SERVICE = Symbol('PaymentsService');
