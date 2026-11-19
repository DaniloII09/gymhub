import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  ClassNotTodayError,
  DropInPaymentDeclinedError,
  MemberNotFoundError,
  PendingMembershipExistsError,
} from '@Memberships/errors';
import { Prisma, type Membership, type PlanType } from '@PrismaClient';
import { addDays, fromDbDate, gymToday, toDbDate } from '../services/membership-dates.js';
import type { MembershipSnapshot } from '../services/membership-status.js';

const PURCHASE_TRANSACTION_TIMEOUT_MS = 10_000;

/** Membresía con lo que piden H26 y el contrato de vencimientos. */
export interface ExpiringRow {
  membershipId: number;
  memberId: string;
  planName: string;
  planType: PlanType;
  endDate: string;
  renewed: boolean;
}

export interface PurchaseData {
  memberId: string;
  planId: number;
  planType: PlanType;
  /** Fecha pedida (AAAA-MM-DD); se corre si el miembro tiene una activa. */
  requestedStart: string;
  durationDays: number;
  createdById: string;
  today: string;
}

/**
 * Crea el cobro de la membresía dentro de la transacción de la compra. Lo
 * implementa el servicio con el contrato CHARGES_SERVICE de Pagos.
 */
export type CreateMembershipCharge = (
  tx: Prisma.TransactionClient,
  membership: Membership,
) => Promise<{ chargeId: number }>;

export interface Purchase {
  membership: Membership;
  chargeId: number;
}

const DROP_IN_TRANSACTION_TIMEOUT_MS = 15_000;

export interface DropInData {
  memberId: string;
  /** Plan DROP_IN activo. */
  planId: number;
  createdById: string;
  /** AAAA-MM-DD, fecha del gimnasio. */
  today: string;
}

/** Pasos de otros módulos que corren dentro de la transacción de la venta. */
export interface DropInSteps {
  /** Clases (H07): ocupa el cupo con la clase bloqueada. */
  reserve: (tx: Prisma.TransactionClient) => Promise<{
    reservationId: number;
    classId: number;
    className: string;
    classStartsAt: Date;
  }>;
  /** Pagos: crea el cobro de la clase suelta. */
  charge: (tx: Prisma.TransactionClient, membership: Membership) => Promise<{ chargeId: number }>;
  /** Pagos: lo paga en efectivo o con tarjeta. */
  pay: (
    tx: Prisma.TransactionClient,
    chargeId: number,
  ) => Promise<
    | { kind: 'APPROVED'; receiptNumber: string; amount: number }
    | { kind: 'DECLINED'; declineReason: string }
  >;
}

export interface DropInSale {
  membership: Membership;
  reservationId: number;
  className: string;
  classStartsAt: Date;
  receiptNumber: string;
  amount: number;
}

/**
 * Único punto del módulo que habla con la tabla `memberships`.
 *
 * El cobro de cada membresía vive en `charges` (Pagos) y apunta a ella con
 * `membership_id`; aquí solo se lee su estado y se crea a través del contrato.
 */
@Injectable()
export class MembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Membresías del miembro con lo que necesita la regla de estado (BE-4.3). */
  async snapshotsFor(memberId: string): Promise<MembershipSnapshot[]> {
    const rows = await this.prisma.membership.findMany({
      where: { memberId },
      select: {
        planType: true,
        startDate: true,
        endDate: true,
        status: true,
        plan: { select: { name: true } },
        charge: { select: { status: true } },
      },
    });
    return rows.map((row) => ({
      planName: row.plan.name,
      planType: row.planType,
      startDate: fromDbDate(row.startDate),
      endDate: fromDbDate(row.endDate),
      // Sin cobro (no debería pasar): se respeta el estado guardado.
      paid: row.charge ? row.charge.status === 'PAID' : row.status !== 'PENDING_PAYMENT',
    }));
  }

  /**
   * Membresías pagadas que vencen en `endDate` (contrato de H26). `renewed` es
   * true si el miembro ya registró otra membresía que inicia después de esta.
   */
  async expiringOn(endDate: string): Promise<ExpiringRow[]> {
    const due = toDbDate(endDate);
    const rows = await this.prisma.membership.findMany({
      where: { endDate: due, charge: { status: 'PAID' } },
      select: {
        id: true,
        memberId: true,
        planType: true,
        plan: { select: { name: true } },
        member: {
          select: { memberships: { where: { startDate: { gt: due } }, select: { id: true } } },
        },
      },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      membershipId: row.id,
      memberId: row.memberId,
      planName: row.plan.name,
      planType: row.planType,
      endDate,
      renewed: row.member.memberships.length > 0,
    }));
  }

  /**
   * Registra la compra o renovación y su cobro en una sola transacción
   * (BE-4.1). La fila del miembro se bloquea con FOR UPDATE: dos ventas
   * simultáneas al mismo miembro se atienden de una en una, así que la segunda
   * ve la primera y no se duplican ni se cruzan las fechas.
   *
   * - Si el miembro tiene una membresía pagada que no ha vencido, la nueva
   *   inicia el día siguiente a su vencimiento: no pierde días.
   * - endDate = startDate + durationDays − 1 (último día con acceso).
   * - isRenewal: ya tuvo antes una membresía MONTHLY o QUARTERLY.
   *
   * @throws {MemberNotFoundError} si no existe un miembro activo con ese id.
   * @throws {PendingMembershipExistsError} si ya tiene una sin pagar vigente.
   */
  async purchase(data: PurchaseData, createCharge: CreateMembershipCharge): Promise<Purchase> {
    return this.prisma.$transaction(
      async (tx) => {
        const member = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM users
          WHERE id = ${data.memberId}::uuid AND role = 'MEMBER' AND is_active
          FOR UPDATE`;
        if (member.length === 0) throw new MemberNotFoundError(data.memberId);

        const previous = await tx.membership.findMany({
          where: { memberId: data.memberId },
          select: {
            planType: true,
            endDate: true,
            status: true,
            charge: { select: { status: true } },
          },
        });
        const today = toDbDate(data.today);
        const isPaid = (m: (typeof previous)[number]) =>
          m.charge ? m.charge.status === 'PAID' : m.status !== 'PENDING_PAYMENT';

        if (previous.some((m) => !isPaid(m) && m.endDate >= today)) {
          throw new PendingMembershipExistsError(data.memberId);
        }

        const lastPaidEnd = previous
          .filter((m) => isPaid(m) && m.endDate >= today)
          .map((m) => fromDbDate(m.endDate))
          .sort()
          .at(-1);
        const startDate = lastPaidEnd ? addDays(lastPaidEnd, 1) : data.requestedStart;
        const endDate = addDays(startDate, data.durationDays - 1);

        const membership = await tx.membership.create({
          data: {
            memberId: data.memberId,
            planId: data.planId,
            planType: data.planType,
            startDate: toDbDate(startDate),
            endDate: toDbDate(endDate),
            status: 'PENDING_PAYMENT',
            isRenewal: previous.some((m) => m.planType !== 'DROP_IN'),
            createdById: data.createdById,
          },
        });
        const { chargeId } = await createCharge(tx, membership);
        return { membership, chargeId };
      },
      { timeout: PURCHASE_TRANSACTION_TIMEOUT_MS },
    );
  }

  /**
   * Venta de clase suelta (BE-4.2) en una sola transacción, de 15 s porque la
   * pasarela simula 2 s con la clase bloqueada:
   *
   * 1. Bloquea al miembro (FOR UPDATE) y verifica que sea un miembro activo.
   * 2. `steps.reserve`: bloquea la clase, valida cupo y estado, y crea la
   *    reserva DROP_IN. Una reserva en línea por el último cupo espera aquí:
   *    solo una de las dos lo obtiene.
   * 3. Crea la membresía ACTIVE con planType DROP_IN que vence hoy.
   * 4. `steps.charge` crea su cobro y `steps.pay` lo paga (efectivo o tarjeta
   *    por la pasarela). Si la pasarela rechaza, se lanza
   *    DropInPaymentDeclinedError y no queda nada guardado.
   *
   * @throws {MemberNotFoundError} si no existe un miembro activo con ese id.
   * @throws {ClassNotTodayError} si la clase no es de hoy.
   * @throws {DropInPaymentDeclinedError} si el pago se rechaza.
   * @throws los errores de dominio de la reserva (clase llena, cancelada, ...).
   */
  async sellDropIn(data: DropInData, steps: DropInSteps): Promise<DropInSale> {
    return this.prisma.$transaction(
      async (tx) => {
        const member = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM users
          WHERE id = ${data.memberId}::uuid AND role = 'MEMBER' AND is_active
          FOR UPDATE`;
        if (member.length === 0) throw new MemberNotFoundError(data.memberId);

        const reservation = await steps.reserve(tx);
        if (gymToday(reservation.classStartsAt) !== data.today) {
          throw new ClassNotTodayError(reservation.classId);
        }

        const day = toDbDate(data.today);
        const membership = await tx.membership.create({
          data: {
            memberId: data.memberId,
            planId: data.planId,
            planType: 'DROP_IN',
            startDate: day,
            endDate: day,
            status: 'ACTIVE',
            createdById: data.createdById,
          },
        });

        const { chargeId } = await steps.charge(tx, membership);
        const payment = await steps.pay(tx, chargeId);
        if (payment.kind === 'DECLINED') {
          throw new DropInPaymentDeclinedError(payment.declineReason);
        }

        return {
          membership,
          reservationId: reservation.reservationId,
          className: reservation.className,
          classStartsAt: reservation.classStartsAt,
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
        };
      },
      { timeout: DROP_IN_TRANSACTION_TIMEOUT_MS },
    );
  }

  /**
   * Clase que incluye la clase suelta del miembro en ese día (H05): su reserva
   * DROP_IN confirmada de una clase de esa fecha del gimnasio.
   */
  async dropInClassFor(
    memberId: string,
    date: string,
  ): Promise<{ name: string; startsAt: Date } | null> {
    // El día del gimnasio va de las 06:00 UTC a las 06:00 UTC del día siguiente.
    const from = new Date(`${date}T00:00:00.000-06:00`);
    const to = new Date(`${addDays(date, 1)}T00:00:00.000-06:00`);
    const reservation = await this.prisma.classReservation.findFirst({
      where: {
        memberId,
        origin: 'DROP_IN',
        status: 'CONFIRMED',
        gymClass: { startsAt: { gte: from, lt: to } },
      },
      select: { gymClass: { select: { name: true, startsAt: true } } },
      orderBy: { gymClass: { startsAt: 'asc' } },
    });
    return reservation?.gymClass ?? null;
  }

  /**
   * Tarea diaria (BE-4.3): sincroniza el estado guardado con el calculado.
   *   1. PENDING_PAYMENT cuyo cobro ya está pagado -> ACTIVE (statusChangedAt
   *      = fecha del pago). Pagos (H15/H16) no toca esta tabla.
   *   2. ACTIVE con endDate anterior a hoy -> EXPIRED.
   * Si corre dos veces el mismo día, la segunda no encuentra nada que cambiar.
   */
  async syncStatuses(today: string, now: Date): Promise<{ activated: number; expired: number }> {
    return this.prisma.$transaction(async (tx) => {
      const activated = await tx.$executeRaw`
        UPDATE memberships AS m
        SET status = 'ACTIVE', status_changed_at = c.paid_at, updated_at = ${now}
        FROM charges AS c
        WHERE c.membership_id = m.id AND m.status = 'PENDING_PAYMENT' AND c.status = 'PAID'`;
      const { count: expired } = await tx.membership.updateMany({
        where: { status: 'ACTIVE', endDate: { lt: toDbDate(today) } },
        data: { status: 'EXPIRED', statusChangedAt: now },
      });
      return { activated, expired };
    });
  }
}
