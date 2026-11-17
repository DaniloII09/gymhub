import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MembershipStatus } from '@Common/contracts';
import {
  PaymentRepository,
  type ApprovedPayment,
  type Authorization,
  type PayChargeData,
} from '@Payments/repositories';
import {
  ChargeAlreadyPaidError,
  ChargeNotFoundError,
  IdempotencyKeyReusedError,
  InvalidCardError,
} from '@Payments/errors';
import type { CardDto, CardPaymentDto, CreatePaymentDto } from '@Payments/dto';
import { MembershipStatusLookup } from './membership-status-lookup.service.js';
import { PaymentGatewayService } from './payment-gateway.service.js';

export const CHARGE_NOT_FOUND_MESSAGE = 'No encontramos ese cobro.';
export const CHARGE_ALREADY_PAID_MESSAGE = 'Este cobro ya está pagado.';
export const IDEMPOTENCY_KEY_REUSED_MESSAGE =
  'La clave de idempotencia ya se usó con otro cobro.';
export const MISSING_CARD_MESSAGE = 'Faltan los datos de la tarjeta.';

/** Mayor id que cabe en la columna INTEGER de `charges`. */
const MAX_CHARGE_ID = 2_147_483_647;

/** Pago en línea del miembro (H16): el comprobante y el estado de su membresía. */
export interface MemberCardPayment extends ApprovedPayment {
  /** Solo para cobros de membresía; null en otro caso o si H04 no está. */
  membershipStatus: MembershipStatus | null;
}

/**
 * Registro de pagos: en recepción (BE-15.2) y en línea por el miembro (BE-16.2).
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
    private readonly membershipStatus: MembershipStatusLookup,
  ) {}

  /**
   * POST /payments (H15): Recepción o Administrador cobran en efectivo o con
   * tarjeta.
   *
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

    return this.execute({
      chargeId: dto.chargeId,
      method: dto.paymentMethod,
      idempotencyKey: dto.idempotencyKey,
      registeredById,
      authorize,
    });
  }

  /**
   * POST /charges/{chargeId}/card-payment (H16): el miembro paga su propio
   * cobro con tarjeta. Usa la misma transacción con bloqueo que H15, así que
   * dos solicitudes sobre el mismo cobro producen un solo pago aprobado.
   *
   * @throws {NotFoundException} 404 si el cobro no existe o es de otro
   * miembro, sin revelar cuál de las dos.
   * @throws {BadRequestException} 400 con el motivo si la tarjeta se rechaza.
   * @throws {ConflictException} 409 si el cobro ya está pagado.
   */
  async payCardAsMember(
    memberId: string,
    chargeId: number,
    dto: CardPaymentDto,
  ): Promise<MemberCardPayment> {
    // Un id fuera de rango haría fallar la consulta con un 500.
    if (chargeId < 1 || chargeId > MAX_CHARGE_ID) {
      throw new NotFoundException(CHARGE_NOT_FOUND_MESSAGE);
    }
    const card: CardDto = dto.card;

    const payment = await this.execute({
      chargeId,
      method: 'CARD',
      idempotencyKey: dto.idempotencyKey,
      // El miembro registra su propio pago.
      registeredById: memberId,
      ownerId: memberId,
      authorize: (amount) => this.gateway.charge(card, amount),
    });

    // Se consulta después del commit: según el contrato membership-status, la
    // membresía queda ACTIVE en cuanto su cobro está PAID.
    const membershipStatus =
      payment.chargeType === 'MEMBERSHIP'
        ? await this.membershipStatus.statusFor(memberId)
        : null;
    return { ...payment, membershipStatus };
  }

  /** Corre el pago y traduce los errores de dominio a respuestas HTTP. */
  private async execute(data: PayChargeData): Promise<ApprovedPayment> {
    let outcome;
    try {
      outcome = await this.paymentRepository.pay(data);
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
