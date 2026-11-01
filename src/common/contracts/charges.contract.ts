import type { User } from '@PrismaClient';

/**
 * Contrato de cobros (Épica 5 · Pagos, dueño: Jaime). Membresías (H04) y
 * sesiones personales (H15) generan un "cobro pendiente" a través de este
 * contrato, sin conocer la tabla de cobros.
 *
 * Decisión de arquitectura: la tabla Charge (de Jaime) apunta a lo que cobra
 * (charge.membershipId / charge.personalSessionId). Así Membership y
 * PersonalSession NO dependen de la tabla de cobros para existir; solo del
 * contrato para crearlos.
 */
export type ChargeType = 'MEMBERSHIP' | 'PERSONAL_SESSION';

export interface CreateChargeInput {
  memberId: User['id'];
  type: ChargeType;
  amount: number;
  description: string;
  /** Id de la membresía o sesión que origina el cobro. */
  referenceId: number;
}

export interface ChargesService {
  /** Crea un cobro en estado PENDING y devuelve su id. */
  createPendingCharge(input: CreateChargeInput): Promise<{ chargeId: number }>;
}

export const CHARGES_SERVICE = Symbol('ChargesService');
