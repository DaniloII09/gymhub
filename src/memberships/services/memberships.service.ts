import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CHARGES_SERVICE,
  PAYMENTS_SERVICE,
  type ChargesService,
  type PaymentsService,
} from '@Common/contracts';
import {
  MembershipRepository,
  PlanRepository,
  type DropInSale,
  type Purchase,
} from '@Memberships/repositories';
import {
  ClassNotTodayError,
  DropInPaymentDeclinedError,
  MemberNotFoundError,
  PendingMembershipExistsError,
} from '@Memberships/errors';
import {
  MISSING_DROP_IN_CARD_MESSAGE,
  type CreateMembershipDto,
  type SellDropInDto,
} from '@Memberships/dto';
import { ClassReservationRepository } from '@Classes/repositories';
import {
  AlreadyReservedError,
  ClassAlreadyStartedError,
  ClassFullError,
  ClassNotFoundError,
  ClassNotScheduledError,
} from '@Classes/errors';
import { Prisma, type Plan } from '@PrismaClient';
import { gymToday } from './membership-dates.js';

export const MEMBER_NOT_FOUND_MESSAGE = 'No encontramos ese miembro.';
export const PLAN_NOT_FOUND_FOR_SALE_MESSAGE = 'No encontramos ese plan.';
export const PLAN_INACTIVE_MESSAGE = 'El plan está desactivado y ya no se vende.';
export const DROP_IN_NOT_ALLOWED_MESSAGE =
  'La clase suelta se vende con su clase y su cobro, no como membresía.';
export const START_DATE_IN_PAST_MESSAGE = 'La fecha de inicio no puede ser anterior a hoy.';
export const PENDING_MEMBERSHIP_MESSAGE = 'El miembro ya tiene una membresía pendiente de pago.';

/**
 * Venta de membresías en recepción (H04 · BE-4.1): registra la compra o
 * renovación de un plan Mensual o Trimestral con su cobro PENDING en Pagos,
 * en la misma transacción.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly planRepository: PlanRepository,
    @Inject(CHARGES_SERVICE) private readonly charges: ChargesService,
    @Inject(PAYMENTS_SERVICE) private readonly payments: PaymentsService,
    private readonly reservations: ClassReservationRepository,
  ) {}

  async purchase(
    dto: CreateMembershipDto,
    soldById: string,
    now: Date = new Date(),
  ): Promise<{ purchase: Purchase; plan: Plan }> {
    const today = gymToday(now);
    const requestedStart = dto.startDate ?? today;
    if (requestedStart < today) throw new BadRequestException(START_DATE_IN_PAST_MESSAGE);

    const plan = await this.planRepository.findById(dto.planId);
    if (!plan) throw new NotFoundException(PLAN_NOT_FOUND_FOR_SALE_MESSAGE);
    if (!plan.isActive) throw new BadRequestException(PLAN_INACTIVE_MESSAGE);
    if (plan.type === 'DROP_IN' || plan.durationDays === null) {
      throw new BadRequestException(DROP_IN_NOT_ALLOWED_MESSAGE);
    }

    try {
      const purchase = await this.membershipRepository.purchase(
        {
          memberId: dto.memberId,
          planId: plan.id,
          planType: plan.type,
          requestedStart,
          durationDays: plan.durationDays,
          createdById: soldById,
          today,
        },
        // El cobro vence el día que inicia la membresía.
        (tx, membership) =>
          this.charges.createPending(
            {
              memberId: membership.memberId,
              type: 'MEMBERSHIP',
              concept: `Membresía ${plan.name}`,
              amount: plan.price.toNumber(),
              dueDate: membership.startDate,
              membershipId: membership.id,
            },
            tx,
          ),
      );
      return { purchase, plan };
    } catch (error) {
      if (error instanceof MemberNotFoundError) {
        throw new NotFoundException(MEMBER_NOT_FOUND_MESSAGE);
      }
      if (error instanceof PendingMembershipExistsError) {
        throw new ConflictException(PENDING_MEMBERSHIP_MESSAGE);
      }
      throw error;
    }
  }

  /**
   * Venta de clase suelta (BE-4.2): con la clase bloqueada, ocupa el cupo,
   * crea la membresía ACTIVE que vence hoy y cobra el precio del plan DROP_IN
   * activo (leído en el servidor), todo en una transacción. Si falta cupo o la
   * pasarela rechaza, no se guarda nada.
   */
  async sellDropIn(dto: SellDropInDto, soldById: string, now: Date = new Date()): Promise<DropInSale> {
    if (dto.paymentMethod === 'CARD' && !dto.card) {
      throw new BadRequestException(MISSING_DROP_IN_CARD_MESSAGE);
    }
    const plan = await this.planRepository.findActiveDropIn();
    if (!plan) throw new BadRequestException(NO_DROP_IN_PLAN_MESSAGE);
    const today = gymToday(now);

    try {
      return await this.membershipRepository.sellDropIn(
        { memberId: dto.memberId, planId: plan.id, createdById: soldById, today },
        {
          reserve: async (tx) => {
            const reservation = await this.reservations.reserveInTransaction(
              tx,
              dto.classId,
              dto.memberId,
              { now, origin: 'DROP_IN' },
            );
            return {
              reservationId: reservation.id,
              classId: reservation.classId,
              className: reservation.gymClass.name,
              classStartsAt: reservation.gymClass.startsAt,
            };
          },
          charge: (tx, membership) =>
            this.charges.createPending(
              {
                memberId: membership.memberId,
                type: 'DROP_IN',
                concept: plan.name,
                amount: plan.price.toNumber(),
                dueDate: membership.startDate,
                membershipId: membership.id,
              },
              tx,
            ),
          pay: (tx, chargeId) =>
            this.payments.payInTransaction(
              {
                chargeId,
                method: dto.paymentMethod,
                card: dto.card,
                idempotencyKey: dto.idempotencyKey,
                registeredById: soldById,
              },
              tx,
            ),
        },
      );
    } catch (error) {
      throw dropInHttpError(error, dto);
    }
  }
}

export const NO_DROP_IN_PLAN_MESSAGE = 'No hay un plan de clase suelta activo para vender.';
export const CLASS_NOT_FOUND_MESSAGE = 'No encontramos esa clase.';
export const CLASS_FULL_MESSAGE = 'La clase está llena.';
export const CLASS_CANCELLED_MESSAGE = 'La clase está cancelada.';
export const CLASS_ALREADY_STARTED_MESSAGE = 'La clase ya inició.';
export const CLASS_NOT_TODAY_MESSAGE = 'La clase suelta solo se vende para una clase de hoy.';
export const ALREADY_RESERVED_MESSAGE = 'El miembro ya tiene una reserva en esa clase.';

/** Traduce los errores de la venta de clase suelta a respuestas HTTP. */
function dropInHttpError(error: unknown, dto: SellDropInDto): unknown {
  if (error instanceof MemberNotFoundError) return new NotFoundException(MEMBER_NOT_FOUND_MESSAGE);
  if (error instanceof ClassNotFoundError) return new NotFoundException(CLASS_NOT_FOUND_MESSAGE);
  if (error instanceof ClassFullError) return new ConflictException(CLASS_FULL_MESSAGE);
  if (error instanceof ClassNotScheduledError) return new ConflictException(CLASS_CANCELLED_MESSAGE);
  if (error instanceof ClassAlreadyStartedError) {
    return new ConflictException(CLASS_ALREADY_STARTED_MESSAGE);
  }
  if (error instanceof ClassNotTodayError) return new ConflictException(CLASS_NOT_TODAY_MESSAGE);
  if (error instanceof AlreadyReservedError) return new ConflictException(ALREADY_RESERVED_MESSAGE);
  // Dos ventas a la vez del mismo miembro en la misma clase: la segunda choca
  // con el índice único parcial de reservas.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException(ALREADY_RESERVED_MESSAGE);
  }
  if (error instanceof DropInPaymentDeclinedError) {
    // Igual que POST /payments: el motivo en `message` y en `declineReason`.
    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: error.declineReason,
      declineReason: error.declineReason,
      paymentMethod: dto.paymentMethod,
    });
  }
  return error;
}
