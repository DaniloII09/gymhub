import { Module } from '@nestjs/common';
import { NOTIFICATION_SERVICE } from '@Common/contracts';
import { NotificationRepository } from '@Notifications/repositories';
import { NotificationsService } from '@Notifications/services';

// Épica 9 · Notificaciones. Dueño: Juan Carlos.
// Contrato para los demás módulos en ./README.md.
@Module({
  providers: [
    NotificationsService,
    // Los demás módulos (H26, H27) inyectan el contrato, no la clase concreta.
    { provide: NOTIFICATION_SERVICE, useExisting: NotificationsService },
    NotificationRepository,
  ],
  exports: [NOTIFICATION_SERVICE],
})
export class NotificationsModule {}
