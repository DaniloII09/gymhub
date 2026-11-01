/**
 * Estado de membresía (BE-4.3, dueño: Danilo). Lo consumen H06 (listado de
 * miembros), H18 (check-in) y H30 (reseñas: requiere membresía activa).
 *
 * Regla de cálculo (no se guarda en la tabla):
 *   cobro no pagado        -> PENDING_PAYMENT
 *   endDate < hoy          -> EXPIRED
 *   en otro caso           -> ACTIVE
 *   sin ninguna membresía  -> NONE
 */
export type MembershipStatus =
  | 'ACTIVE'
  | 'PENDING_PAYMENT'
  | 'EXPIRED'
  | 'NONE';

export interface MembershipStatusService {
  getStatusForMember(memberId: string): Promise<MembershipStatus>;
}

export const MEMBERSHIP_STATUS_SERVICE = Symbol('MembershipStatusService');
