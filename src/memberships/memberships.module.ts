import { Module } from '@nestjs/common';
import { MyMembershipController, PlansController } from '@Memberships/controllers';
import { MyMembershipService, PlansService } from '@Memberships/services';
import { PlanRepository } from '@Memberships/repositories';

// Épica 1 · Membresías y planes. Dueño: Danilo.
// H03: planes del gimnasio (alta, edición, listado y desactivación).
//
// H05 (Juan Carlos): "Mi membresía" consulta el contrato
// MEMBERSHIP_STATUS_SERVICE, que registra H04 en este mismo módulo.
@Module({
  controllers: [MyMembershipController, PlansController],
  providers: [MyMembershipService, PlansService, PlanRepository],
})
export class MembershipsModule {}
