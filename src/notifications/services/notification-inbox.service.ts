import { Injectable, NotFoundException } from '@nestjs/common';
import { paginate, toSkipTake, type Paginated } from '@Common/pagination';
import { INBOX_PAGE_SIZE } from '@Notifications/dto';
import { NotificationNotFoundError } from '@Notifications/errors';
import { NotificationRepository } from '@Notifications/repositories';
import type { Notification } from '@PrismaClient';

export const NOTIFICATION_NOT_FOUND_MESSAGE = 'No encontramos ese aviso.';

/**
 * Bandeja de avisos de cada usuario (BE-25.1 / H25).
 *
 * El usuario siempre sale del token: nadie puede ver ni marcar los avisos de
 * otra persona. Un aviso ajeno responde 404, igual que uno inexistente.
 */
@Injectable()
export class NotificationInboxService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async list(userId: string, page: number): Promise<Paginated<Notification>> {
    const query = { page, pageSize: INBOX_PAGE_SIZE };
    const { notifications, total } =
      await this.notificationRepository.findInboxPage({
        userId,
        ...toSkipTake(query),
      });
    return paginate(notifications, total, query);
  }

  unreadCount(userId: string): Promise<number> {
    return this.notificationRepository.countUnread(userId);
  }

  async markRead(notificationId: number, userId: string): Promise<void> {
    try {
      await this.notificationRepository.markRead(notificationId, userId);
    } catch (error) {
      if (error instanceof NotificationNotFoundError) {
        throw new NotFoundException(NOTIFICATION_NOT_FOUND_MESSAGE);
      }
      throw error;
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepository.markAllRead(userId);
  }
}
