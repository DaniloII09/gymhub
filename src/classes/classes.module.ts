import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import {
  ClassReservationsController,
  ClassesController,
} from '@Classes/controllers';
import {
  ClassReservationsService,
  ClassesService,
  MembershipEligibilityService,
} from '@Classes/services';
import {
  ClassRepository,
  ClassReservationRepository,
} from '@Classes/repositories';

// Épica 2 · Clases grupales. Dueño: Luis (H06, H07).
@Module({
  imports: [NotificationsModule],
  controllers: [ClassesController, ClassReservationsController],
  providers: [
    ClassesService,
    ClassRepository,
    ClassReservationsService,
    ClassReservationRepository,
    MembershipEligibilityService,
  ],
  exports: [
    ClassesService,
    ClassRepository,
    ClassReservationsService,
    ClassReservationRepository,
  ],
})
export class ClassesModule {}
