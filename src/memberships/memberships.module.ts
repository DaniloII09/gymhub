import { Module } from '@nestjs/common';
import { MEMBERSHIP_EXPIRY_SOURCE, MEMBERSHIP_STATUS_SERVICE } from '@Common/contracts';
import { PaymentsModule } from '@Payments';
import { ClassesModule } from '@Classes';
import {
  MembershipsController,
  MyMembershipController,
  PlansController,
} from '@Memberships/controllers';
import {
  MembershipExpiryJob,
  MembershipStatusService,
  MembershipsService,
  MyMembershipService,
  PlansService,
} from '@Memberships/services';
import { MembershipRepository, PlanRepository } from '@Memberships/repositories';

// Épica 1 · Membresías y planes. Dueño: Danilo.
// H03: planes del gimnasio (alta, edición, listado y desactivación).
// H04: venta de membresías con su cobro (CHARGES_SERVICE de Pagos), venta de
// clase suelta (pago con PAYMENTS_SERVICE y reserva con ClassReservationRepository
// de Clases, en la misma transacción), estado de la membresía y tarea diaria
// de vencimiento.
//
// H05 (Juan Carlos): "Mi membresía" consulta el contrato
// MEMBERSHIP_STATUS_SERVICE, que se registra aquí.
@Module({
  imports: [PaymentsModule, ClassesModule],
  controllers: [MyMembershipController, PlansController, MembershipsController],
  providers: [
    MyMembershipService,
    PlansService,
    PlanRepository,
    MembershipsService,
    MembershipRepository,
    MembershipStatusService,
    MembershipExpiryJob,
    // Contratos para otros módulos: reservas (H07), Mi membresía (H05), pagos
    // en línea (H16) y check-in (H13) leen el estado; avisos (H26), los
    // vencimientos. Los buscan con ModuleRef, por eso no se importan aquí.
    { provide: MEMBERSHIP_STATUS_SERVICE, useExisting: MembershipStatusService },
    { provide: MEMBERSHIP_EXPIRY_SOURCE, useExisting: MembershipStatusService },
  ],
  exports: [MEMBERSHIP_STATUS_SERVICE, MEMBERSHIP_EXPIRY_SOURCE],
})
export class MembershipsModule {}
