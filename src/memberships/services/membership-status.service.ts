import { Injectable } from '@nestjs/common';
import type {
  CurrentMembership,
  ExpiringMembership,
  MembershipExpirySource,
  MembershipStatusService as MembershipStatusContract,
} from '@Common/contracts';
import { MembershipRepository } from '@Memberships/repositories';
import { endOfGymDay, gymToday } from './membership-dates.js';
import { computeCurrentMembership } from './membership-status.js';

/**
 * Estado de la membresía (BE-4.3). Implementa dos contratos para el resto del
 * sistema, registrados en MembershipsModule:
 *
 * - MEMBERSHIP_STATUS_SERVICE: el estado actual de un miembro. Lo consumen
 *   reservas (H07), Mi membresía (H05), pagos en línea (H16) y check-in (H13).
 * - MEMBERSHIP_EXPIRY_SOURCE: las membresías por vencer de los avisos (H26).
 *
 * La regla de estado vive en `computeCurrentMembership`, así todas las
 * pantallas ven el mismo estado.
 */
@Injectable()
export class MembershipStatusService implements MembershipStatusContract, MembershipExpirySource {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async currentFor(memberId: string, now: Date = new Date()): Promise<CurrentMembership> {
    const today = gymToday(now);
    const memberships = await this.membershipRepository.snapshotsFor(memberId);
    const current = computeCurrentMembership(memberships, today);

    // La clase suelta de hoy trae la clase que incluye (H05).
    if (current.status === 'ACTIVE' && current.planType === 'DROP_IN') {
      return {
        ...current,
        includedClass: await this.membershipRepository.dropInClassFor(memberId, today),
      };
    }
    return current;
  }

  async expiringOn(endDate: string): Promise<ExpiringMembership[]> {
    const rows = await this.membershipRepository.expiringOn(endDate);
    return rows.map((row) => ({ ...row, endDate: endOfGymDay(row.endDate) }));
  }
}
