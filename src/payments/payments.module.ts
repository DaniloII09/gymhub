import { Module } from '@nestjs/common';
import { CHARGES_SERVICE, PAYMENTS_SERVICE } from '@Common/contracts';
import {
  ChargesController,
  MemberPaymentsController,
  PaymentsController,
  PendingChargesController,
  ReceiptsController,
} from '@Payments/controllers';
import {
  ChargesService,
  MembershipStatusLookup,
  PaymentGatewayService,
  PaymentsService,
  ReceiptsService,
} from '@Payments/services';
import {
  ChargeRepository,
  PaymentRepository,
  ReceiptRepository,
} from '@Payments/repositories';

// Épica 5 · Pagos y facturación. Dueño: Jaime.
@Module({
  controllers: [
    ChargesController,
    // H16: "Mis pagos" del miembro.
    MemberPaymentsController,
    PaymentsController,
    // H17: pagos pendientes del administrador.
    PendingChargesController,
    ReceiptsController,
  ],
  providers: [
    ChargesService,
    // Otros módulos (H04, H11) inyectan el contrato, no la clase concreta.
    { provide: CHARGES_SERVICE, useExisting: ChargesService },
    // H04 (clase suelta) paga dentro de su propia transacción.
    { provide: PAYMENTS_SERVICE, useExisting: PaymentsService },
    PaymentGatewayService,
    PaymentsService,
    MembershipStatusLookup,
    ReceiptsService,
    ChargeRepository,
    PaymentRepository,
    ReceiptRepository,
  ],
  // La pasarela la reutilizan H04 (clase suelta) y H16 (pago en línea).
  exports: [CHARGES_SERVICE, PAYMENTS_SERVICE, PaymentGatewayService],
})
export class PaymentsModule {}
