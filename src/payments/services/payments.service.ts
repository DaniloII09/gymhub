import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentRepository,
  type ApprovedPayment,
  type Authorization,
} from '@Payments/repositories';
import {
  ChargeAlreadyPaidError,
  ChargeNotFoundError,
  IdempotencyKeyReusedError,
  InvalidCardError,
} from '@Payments/errors';
import type { CreatePaymentDto } from '@Payments/dto';
import { PaymentGatewayService } from './payment-gateway.service.js';

export const CHARGE_NOT_FOUND_MESSAGE = 'No encontramos ese cobro.';
export const CHARGE_ALREADY_PAID_MESSAGE = 'Este cobro ya está pagado.';
export const IDEMPOTENCY_KEY_REUSED_MESSAGE =
  'La clave de idempotencia ya se usó con otro cobro.';
export const MISSING_CARD_MESSAGE = 'Faltan los datos de la tarjeta.';

/**
 * Registro de pagos en recepción (BE-15.2).
 *
 * No conoce Prisma: la transacción vive en PaymentRepository. Este servicio
 * decide cómo se autoriza el pago (efectivo directo, tarjeta por la pasarela)
 * y traduce los errores de dominio a respuestas HTTP.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly gateway: PaymentGatewayService,
  ) {}

  /**
   * @throws {BadRequestException} 400 con el motivo si la tarjeta se rechaza.
   * @throws {NotFoundException} 404 si el cobro no existe.
   * @throws {ConflictException} 409 si el cobro ya está pagado.
   */
  async pay(
    dto: CreatePaymentDto,
    registeredById: string,
  ): Promise<ApprovedPayment> {
    const card = dto.card;
    if (dto.paymentMethod === 'CARD' && !card) {
      throw new BadRequestException(MISSING_CARD_MESSAGE);
    }

    const authorize = async (amount: number): Promise<Authorization> => {
      if (dto.paymentMethod === 'CASH' || !card) {
        return { result: 'APPROVED', declineReason: null, cardLast4: null };
      }
      return this.gateway.charge(card, amount);
    };

    let outcome;
    try {
      outcome = await this.paymentRepository.pay({
        chargeId: dto.chargeId,
        method: dto.paymentMethod,
        idempotencyKey: dto.idempotencyKey,
        registeredById,
        authorize,
      });
    } catch (error) {
      if (error instanceof ChargeNotFoundError) {
        throw new NotFoundException(CHARGE_NOT_FOUND_MESSAGE);
      }
      if (error instanceof ChargeAlreadyPaidError) {
        throw new ConflictException(CHARGE_ALREADY_PAID_MESSAGE);
      }
      if (error instanceof IdempotencyKeyReusedError) {
        throw new BadRequestException(IDEMPOTENCY_KEY_REUSED_MESSAGE);
      }
      if (error instanceof InvalidCardError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    if (outcome.kind === 'DECLINED') {
      // El intento ya quedó guardado con su motivo; el cobro sigue PENDING.
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: outcome.declineReason,
        declineReason: outcome.declineReason,
      });
    }
    return outcome.payment;
  }
}
