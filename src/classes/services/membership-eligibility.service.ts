import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  MEMBERSHIP_STATUS_SERVICE,
  type MembershipStatusService,
} from '@Common/contracts';
import {
  DropInMembershipNotAllowedError,
  MembershipInactiveError,
  MembershipUnavailableError,
} from '@Classes/errors';

/**
 * Valida la elegibilidad de membresía del miembro para reservar clases (BE-7.2).
 *
 * Consume el contrato `MEMBERSHIP_STATUS_SERVICE` (BE-4.3 / H04) mediante
 * `ModuleRef` sin acoplar `ClassesModule` ni simular respuestas: si el proveedor
 * real aún no está registrado en el contenedor, falla de forma cerrada
 * lanzando `MembershipUnavailableError`.
 */
@Injectable()
export class MembershipEligibilityService {
  constructor(private readonly moduleRef: ModuleRef) {}

  isProviderAvailable(): boolean {
    return this.findService() !== null;
  }

  /**
   * @throws {MembershipUnavailableError} si H04 aún no provee `MEMBERSHIP_STATUS_SERVICE`.
   * @throws {MembershipInactiveError} si la membresía no está ACTIVE o no es mensual/trimestral.
   * @throws {DropInMembershipNotAllowedError} si la única membresía activa es DROP_IN.
   */
  async assertCanReserve(memberId: string): Promise<void> {
    const service = this.findService();
    if (!service) {
      throw new MembershipUnavailableError();
    }

    const current = await service.currentFor(memberId);
    if (current.status !== 'ACTIVE') {
      throw new MembershipInactiveError();
    }

    if (current.planType === 'DROP_IN') {
      throw new DropInMembershipNotAllowedError();
    }

    if (current.planType !== 'MONTHLY' && current.planType !== 'QUARTERLY') {
      throw new MembershipInactiveError();
    }
  }

  private findService(): MembershipStatusService | null {
    try {
      return this.moduleRef.get<MembershipStatusService>(
        MEMBERSHIP_STATUS_SERVICE,
        { strict: false },
      );
    } catch {
      // ModuleRef lanza si ningún módulo provee el token.
      return null;
    }
  }
}
