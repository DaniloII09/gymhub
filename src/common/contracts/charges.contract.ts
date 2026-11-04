import type { User, Prisma } from '@PrismaClient';

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
export type ChargeType = 'MEMBERSHIP' | 'PERSONAL_SESSION' | 'DROP_IN';

export interface CreateChargeInput {
  memberId: User['id'];
  type: ChargeType;
  concept: string;
  amount: number;
  dueDate: Date;
  /** Id de la membresía que origina el cobro. Opcional. */
  membershipId?: number;
}

export interface ChargesService {
  /** Crea un cobro PENDIENTE dentro de la tx recibida y devuelve su id. */
  createPending(
    input: CreateChargeInput,
    tx: Prisma.TransactionClient,
  ): Promise<{ chargeId: number }>;
}

export const CHARGES_SERVICE = Symbol('ChargesService');
