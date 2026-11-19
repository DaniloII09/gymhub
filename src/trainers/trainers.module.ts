import { Module } from '@nestjs/common';
import { PaymentsModule } from '@Payments';
import { AuthModule } from '@Auth';
import {
  AvailabilityBlocksController,
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
@Module({
  imports: [PaymentsModule, AuthModule],
  controllers: [TrainersController, PersonalSessionsController, AvailabilityBlocksController],
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
