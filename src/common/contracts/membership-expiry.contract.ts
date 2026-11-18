import type { PlanType } from './membership-status.contract.js';

/**
 * Membresías por vencer (Épica 9 · H26, dueño del aviso: Juan Carlos). Lo
 * implementa Membresías (H04, dueño: Danilo), que es quien tiene la tabla.
 *
 * La tarea diaria de H26 pide las membresías que vencen en una fecha y decide
 * a quién avisar: descarta la clase suelta y a quien ya renovó. Por eso este
 * contrato solo devuelve datos, sin filtrar.
 *
 * Registro en MembershipsModule (H04):
 *   { provide: MEMBERSHIP_EXPIRY_SOURCE, useClass: MembershipExpirySourceImpl }
 */
export interface ExpiringMembership {
  membershipId: number;
  memberId: string;
  planName: string;
  planType: PlanType;
  endDate: Date;
  /**
   * true si el miembro ya tiene registrada la membresía que sigue a esta
   * (renovación), aunque todavía no empiece.
   */
  renewed: boolean;
}

export interface MembershipExpirySource {
  /**
   * Membresías pagadas cuyo vencimiento es `endDate` (AAAA-MM-DD, fecha del
   * gimnasio en America/El_Salvador).
   */
  expiringOn(endDate: string): Promise<ExpiringMembership[]>;
}

export const MEMBERSHIP_EXPIRY_SOURCE = Symbol('MembershipExpirySource');
