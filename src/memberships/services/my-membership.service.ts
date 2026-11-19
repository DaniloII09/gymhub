import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  MEMBERSHIP_STATUS_SERVICE,
  type MembershipStatusService,
} from '@Common/contracts';
import { MyMembershipResponseDto } from '@Memberships/dto';

export const MEMBERSHIP_STATUS_UNAVAILABLE_MESSAGE =
  'La consulta de membresías todavía no está disponible.';

/**
 * "Mi membresía" (BE-5.1 / H05). Usa el servicio de estado de BE-4.3 para el
 * miembro que hace la solicitud.
 *
 * El contrato MEMBERSHIP_STATUS_SERVICE lo implementa H04. Se busca en tiempo
 * de ejecución con ModuleRef, igual que Pagos (H16), para que H05 funcione en
 * cuanto H04 lo registre sin cambiar nada aquí. Mientras no exista, responde
 * 503 con un mensaje claro en vez de inventar un estado.
 */
@Injectable()
export class MyMembershipService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async forMember(memberId: string): Promise<MyMembershipResponseDto> {
    const statusService = this.findStatusService();
    if (!statusService) {
      throw new ServiceUnavailableException(
        MEMBERSHIP_STATUS_UNAVAILABLE_MESSAGE,
      );
    }
    const current = await statusService.currentFor(memberId);
    return MyMembershipResponseDto.fromContract(current);
  }

  private findStatusService(): MembershipStatusService | null {
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
