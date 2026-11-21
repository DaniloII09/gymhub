import type { CurrentMembership, PlanType } from '@Common/contracts';
import { daysBetween, endOfGymDay } from './membership-dates.js';

/** Lo que la regla de estado necesita de cada membresía del miembro. */
export interface MembershipSnapshot {
  planName: string;
  planType: PlanType;
  /** AAAA-MM-DD */
  startDate: string;
  /** AAAA-MM-DD, último día con acceso. */
  endDate: string;
  /** true si su cobro está pagado. */
  paid: boolean;
}

const NONE: CurrentMembership = {
  status: 'NONE',
  planName: null,
  planType: null,
  endDate: null,
  daysLeft: null,
};

/**
 * Regla única del estado de la membresía (BE-4.3). No se guarda: se calcula al
 * leer, así una membresía vencida se ve vencida aunque la tarea diaria no haya
 * corrido, y una pagada se ve activa en cuanto su cobro pasa a pagado.
 *
 * 1. ACTIVE: tiene una membresía pagada que no ha vencido (hoy <= endDate).
 *    Si hay varias (p. ej. la actual y su renovación ya pagada), se muestra la
 *    que inicia primero, que es la que está corriendo.
 * 2. PENDING_PAYMENT: si no hay activa, la más reciente sin pagar que no ha
 *    vencido.
 * 3. EXPIRED: tuvo membresías pero todas vencieron; se muestra la de endDate
 *    más reciente.
 * 4. NONE: nunca ha tenido una.
 *
 * daysLeft son los días de hoy al vencimiento (0 si vence hoy); null si ya
 * venció o no hay membresía.
 */
export function computeCurrentMembership(
  memberships: MembershipSnapshot[],
  today: string,
): CurrentMembership {
  if (memberships.length === 0) return NONE;

  const notExpired = memberships.filter((m) => m.endDate >= today);
  const byStart = (a: MembershipSnapshot, b: MembershipSnapshot) =>
    a.startDate.localeCompare(b.startDate);
  const byEndDesc = (a: MembershipSnapshot, b: MembershipSnapshot) =>
    b.endDate.localeCompare(a.endDate);

  const active = notExpired.filter((m) => m.paid).sort(byStart)[0];
  if (active) return describe(active, 'ACTIVE', today);

  const pending = notExpired.filter((m) => !m.paid).sort(byEndDesc)[0];
  if (pending) return describe(pending, 'PENDING_PAYMENT', today);

  const latest = [...memberships].sort(byEndDesc)[0];
  return { ...describe(latest, 'EXPIRED', today), daysLeft: null };
}

function describe(
  m: MembershipSnapshot,
  status: CurrentMembership['status'],
  today: string,
): CurrentMembership {
  return {
    status,
    planName: m.planName,
    planType: m.planType,
    endDate: endOfGymDay(m.endDate),
    daysLeft: Math.max(0, daysBetween(today, m.endDate)),
  };
}
