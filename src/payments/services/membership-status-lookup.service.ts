import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  MEMBERSHIP_STATUS_SERVICE,
  type MembershipStatus,
  type MembershipStatusService,
} from '@Common/contracts';

/**
 * Estado de la membresía para la respuesta del pago en línea (H16).
 *
 * El contrato MEMBERSHIP_STATUS_SERVICE lo implementa H04 (Danilo). Se busca
 * en tiempo de ejecución con ModuleRef, sin importar MembershipsModule, por
 * dos razones:
 * - MembershipsModule ya importa PaymentsModule para crear cobros
 *   (CHARGES_SERVICE); importarlo aquí formaría una dependencia circular.
 * - Mientras H04 no registre el contrato, el pago funciona igual y esta clase
 *   responde null. Cuando lo registre, empieza a responder sin tocar Pagos.
 */
@Injectable()
export class MembershipStatusLookup {
  constructor(private readonly moduleRef: ModuleRef) {}

  /** null si el contrato todavía no está registrado. */
  async statusFor(memberId: string): Promise<MembershipStatus | null> {
    const service = this.findService();
    if (!service) return null;
    const current = await service.currentFor(memberId);
    return current.status;
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
