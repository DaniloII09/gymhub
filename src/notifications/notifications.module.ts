import { Module } from '@nestjs/common';
import {
  CLASS_CANCELLATION_NOTIFIER,
  NOTIFICATION_SERVICE,
} from '@Common/contracts';
import { NotificationsController } from '@Notifications/controllers';
import {
  ClassCancellationRepository,
  NotificationRepository,
} from '@Notifications/repositories';
import {
  ClassCancellationNoticesService,
  NotificationInboxService,
  NotificationsService,
} from '@Notifications/services';

// Épica 9 · Notificaciones. Dueño: Juan Carlos.
// Contrato para los demás módulos en ./README.md.
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    // Los demás módulos (H26, H27) inyectan el contrato, no la clase concreta.
    { provide: NOTIFICATION_SERVICE, useExisting: NotificationsService },
    NotificationInboxService,
    NotificationRepository,
    // H27: H09 lo inyecta para avisar a quienes reservaron una clase cancelada.
    ClassCancellationNoticesService,
    ClassCancellationRepository,
    {
      provide: CLASS_CANCELLATION_NOTIFIER,
      useExisting: ClassCancellationNoticesService,
    },
  ],
  exports: [NOTIFICATION_SERVICE, CLASS_CANCELLATION_NOTIFIER],
})
export class NotificationsModule {}
