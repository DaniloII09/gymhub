import { NotFoundException } from '@nestjs/common';
import { NotificationNotFoundError } from '@Notifications/errors';
import type { NotificationRepository } from '@Notifications/repositories';
import {
  NOTIFICATION_NOT_FOUND_MESSAGE,
  NotificationInboxService,
} from '@Notifications/services';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('NotificationInboxService', () => {
  let repository: {
    findInboxPage: ReturnType<typeof vi.fn>;
    countUnread: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    markAllRead: ReturnType<typeof vi.fn>;
  };
  let service: NotificationInboxService;

  beforeEach(() => {
    repository = {
      findInboxPage: vi.fn(),
      countUnread: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    };
    service = new NotificationInboxService(
      repository as unknown as NotificationRepository,
    );
  });

  describe('list', () => {
    it('pide la página del usuario de 20 en 20 y arma la respuesta paginada', async () => {
      const notifications = [{ id: 3 }, { id: 2 }];
      repository.findInboxPage.mockResolvedValue({ notifications, total: 22 });

      await expect(service.list(USER_ID, 2)).resolves.toEqual({
        data: notifications,
        total: 22,
        page: 2,
        pageSize: 20,
      });
      expect(repository.findInboxPage).toHaveBeenCalledWith({
        userId: USER_ID,
        skip: 20,
        take: 20,
      });
    });
  });

  it('unreadCount devuelve el conteo del usuario', async () => {
    repository.countUnread.mockResolvedValue(4);

    await expect(service.unreadCount(USER_ID)).resolves.toBe(4);
    expect(repository.countUnread).toHaveBeenCalledWith(USER_ID);
  });

  describe('markRead', () => {
    it('marca el aviso del usuario', async () => {
      repository.markRead.mockResolvedValue(undefined);

      await service.markRead(7, USER_ID);
      expect(repository.markRead).toHaveBeenCalledWith(7, USER_ID);
    });

    it('responde 404 si el aviso no existe o es de otro usuario', async () => {
      repository.markRead.mockRejectedValue(new NotificationNotFoundError(7));

      const error = await service.markRead(7, USER_ID).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(
        NOTIFICATION_NOT_FOUND_MESSAGE,
      );
    });

    it('deja pasar otros errores', async () => {
      const failure = new Error('base caída');
      repository.markRead.mockRejectedValue(failure);

      await expect(service.markRead(7, USER_ID)).rejects.toBe(failure);
    });
  });

  it('markAllRead marca todos los avisos del usuario', async () => {
    repository.markAllRead.mockResolvedValue(3);

    await expect(service.markAllRead(USER_ID)).resolves.toBeUndefined();
    expect(repository.markAllRead).toHaveBeenCalledWith(USER_ID);
  });
});
