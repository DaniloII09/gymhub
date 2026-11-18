import { Module } from '@nestjs/common';
import { PaymentsModule } from '@Payments';
import {
  PersonalSessionsController,
  TrainersController,
} from '@Trainers/controllers';
import {
  AvailabilityBlockRepository,
  PersonalSessionRepository,
} from '@Trainers/repositories';
import {
  AvailabilityBlocksService,
  PersonalSessionsService,
  SessionPricingService,
} from '@Trainers/services';

// Épica 3 · Agenda de entrenadores (H10 disponibilidad y H11 sesiones personales).
// Se reutilizan AvailabilityBlockRepository y AvailabilityBlocksService de H10.
// AvailabilityBlocksController aún requiere importar AuthModule y ajustar
// @CurrentUser en su rama de origen, por lo que aquí no se monta ni reescribe.
@Module({
  imports: [PaymentsModule],
  controllers: [TrainersController, PersonalSessionsController],
  providers: [
    AvailabilityBlockRepository,
    AvailabilityBlocksService,
    PersonalSessionRepository,
    SessionPricingService,
    PersonalSessionsService,
  ],
  exports: [
    AvailabilityBlocksService,
    PersonalSessionsService,
    SessionPricingService,
  ],
})
export class TrainersModule {}
