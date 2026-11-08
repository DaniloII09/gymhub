import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  ChargeAlreadyPaidError,
  ChargeNotFoundError,
  IdempotencyKeyReusedError,
} from '@Payments/errors';
import { Prisma, type PaymentMethod } from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** La pasarela simula 2 s dentro de la transacción; el default de Prisma es 5 s. */
const PAY_TRANSACTION_TIMEOUT_MS = 15_000;

/** C-000001, C-000002, ... */
export function receiptNumber(id: number | bigint): string {
  return `C-${String(id).padStart(6, '0')}`;
}

/** Lo que responde quien autoriza el cobro (la pasarela, o nada si es efectivo). */
export interface Authorization {
  result: 'APPROVED' | 'DECLINED';
  declineReason: string | null;
  cardLast4: string | null;
}

export interface PayChargeData {
  chargeId: number;
  method: PaymentMethod;
  idempotencyKey: string;
  registeredById: string;
  /** Se llama con el monto guardado del cobro, ya bloqueado. */
  authorize: (amount: number) => Promise<Authorization>;
}

/** Pago aprobado con los datos que muestra el comprobante. */
export interface ApprovedPayment {
  paymentId: number;
  chargeId: number;
  concept: string;
  amount: number;
  method: PaymentMethod;
  cardLast4: string | null;
  receiptId: number;
  receiptNumber: string;
  issuedAt: Date;
}

export type PaymentOutcome =
  | { kind: 'APPROVED'; payment: ApprovedPayment }
  | { kind: 'DECLINED'; declineReason: string };

const WITH_RECEIPT = { charge: true, receipt: true } as const;
type PaymentWithReceipt = Prisma.PaymentGetPayload<{
  include: typeof WITH_RECEIPT;
}>;

/**
 * Único punto del módulo que escribe en `payments` y `receipts`, y que cambia
 * el estado de un cobro.
 */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paga un cobro en una sola transacción:
   *
   * 1. Bloquea el cobro con SELECT … FOR UPDATE: otra solicitud sobre el mismo
   *    cobro espera aquí hasta que esta termine.
   * 2. Si la clave de idempotencia ya existe para este cobro, devuelve el
   *    resultado original sin cobrar dos veces.
   * 3. Toma el monto del cobro guardado (nunca de la solicitud) y lo autoriza.
   * 4. Guarda el intento. Si fue rechazado, el cobro sigue PENDING.
   * 5. Si fue aprobado, emite el comprobante y pasa el cobro a PAID.
   *
   * @throws {ChargeNotFoundError} si el cobro no existe.
   * @throws {ChargeAlreadyPaidError} si el cobro ya está pagado.
   * @throws {IdempotencyKeyReusedError} si la clave se usó con otro cobro.
   */
  async pay(data: PayChargeData): Promise<PaymentOutcome> {
    try {
      return await this.prisma.$transaction(
        (tx) => this.payInTransaction(tx, data),
        { timeout: PAY_TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      // Dos solicitudes con la misma clave a la vez, o un segundo comprobante
      // del mismo cobro: lo frenan las restricciones únicas de la base.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        const previous = await this.prisma.payment.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          include: WITH_RECEIPT,
        });
        if (previous) return this.toOutcome(previous, data.chargeId);
        throw new ChargeAlreadyPaidError(data.chargeId);
      }
      throw error;
    }
  }

  private async payInTransaction(
    tx: Prisma.TransactionClient,
    data: PayChargeData,
  ): Promise<PaymentOutcome> {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM charges WHERE id = ${data.chargeId} FOR UPDATE`;
    if (locked.length === 0) throw new ChargeNotFoundError(data.chargeId);

    const previous = await tx.payment.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      include: WITH_RECEIPT,
    });
    if (previous) return this.toOutcome(previous, data.chargeId);

    const charge = await tx.charge.findUniqueOrThrow({
      where: { id: data.chargeId },
    });
    if (charge.status === 'PAID') throw new ChargeAlreadyPaidError(charge.id);

    const amount = Number(charge.amount);
    const authorization = await data.authorize(amount);

    const payment = await tx.payment.create({
      data: {
        chargeId: charge.id,
        method: data.method,
        result: authorization.result,
        declineReason: authorization.declineReason,
        cardLast4: authorization.cardLast4,
        idempotencyKey: data.idempotencyKey,
        registeredById: data.registeredById,
      },
    });

    if (authorization.result === 'DECLINED') {
      return {
        kind: 'DECLINED',
        declineReason: authorization.declineReason ?? 'Pago rechazado',
      };
    }

    // El número sale de la misma secuencia del id de `receipts`: así el
    // comprobante C-000007 es la fila 7 y no hace falta una secuencia aparte.
    const [{ next }] = await tx.$queryRaw<{ next: bigint }[]>`
      SELECT nextval(pg_get_serial_sequence('receipts', 'id')) AS next`;
    const receipt = await tx.receipt.create({
      data: {
        id: Number(next),
        number: receiptNumber(next),
        paymentId: payment.id,
        chargeId: charge.id,
      },
    });

    await tx.charge.update({
      where: { id: charge.id },
      data: { status: 'PAID', paidAt: receipt.issuedAt },
    });

    // H04: cuando exista el modelo Membership, la membresía pasa a ACTIVE aquí,
    // en esta misma transacción. Según el contrato membership-status, el estado
    // se calcula a partir del cobro, así que con PAID ya queda activa.
    // H11: la sesión personal lee el estado de su cobro; no hace falta nada más.

    return {
      kind: 'APPROVED',
      payment: {
        paymentId: payment.id,
        chargeId: charge.id,
        concept: charge.concept,
        amount,
        method: payment.method,
        cardLast4: payment.cardLast4,
        receiptId: receipt.id,
        receiptNumber: receipt.number,
        issuedAt: receipt.issuedAt,
      },
    };
  }

  /** Resultado de un pago que ya existía con la misma clave de idempotencia. */
  private toOutcome(
    previous: PaymentWithReceipt,
    chargeId: number,
  ): PaymentOutcome {
    if (previous.chargeId !== chargeId) {
      throw new IdempotencyKeyReusedError(previous.idempotencyKey);
    }
    if (previous.result === 'DECLINED' || !previous.receipt) {
      return {
        kind: 'DECLINED',
        declineReason: previous.declineReason ?? 'Pago rechazado',
      };
    }
    return {
      kind: 'APPROVED',
      payment: {
        paymentId: previous.id,
        chargeId: previous.chargeId,
        concept: previous.charge.concept,
        amount: Number(previous.charge.amount),
        method: previous.method,
        cardLast4: previous.cardLast4,
        receiptId: previous.receipt.id,
        receiptNumber: previous.receipt.number,
        issuedAt: previous.receipt.issuedAt,
      },
    };
  }
}
