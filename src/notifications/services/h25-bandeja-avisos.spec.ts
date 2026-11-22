import { NotFoundException } from '@nestjs/common';
import { NotificationsController } from '@Notifications/controllers';
import { INBOX_PAGE_SIZE } from '@Notifications/dto';
import { NOTIFICATION_NOT_FOUND_MESSAGE } from '@Notifications/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';
import {
  notificationFixture,
  uuid,
} from '../../../test/helpers/notification-fixture.js';

const ME = { id: uuid(1) } as never;
const OTHER = uuid(2);

/** Registra `n` avisos para `userId` por el servicio de H24. */
async function seed(
  f: ReturnType<typeof notificationFixture>,
  userId: string,
  n: number,
) {
  for (let i = 1; i <= n; i++) {
    await f.notifications.notify(
      {
        recipients: [userId],
        title: `Aviso ${i}`,
        message: `Mensaje ${i}`,
        source: i % 2 ? 'MEMBERSHIPS' : 'CLASSES',
      },
      f.tx as never,
    );
  }
}

describe('H25. Ver todos mis avisos en un solo lugar', () => {
  it('AC1: del más reciente al más antiguo, con título, mensaje, fecha y origen, 20 por página', async () => {
    const f = notificationFixture();
    await seed(f, uuid(1), 23);
    const controller = new NotificationsController(f.inbox);

    const first = await controller.list({ page: 1 } as never, ME);
    const second = await controller.list({ page: 2 } as never, ME);

    expect(INBOX_PAGE_SIZE).toBe(20);
    expect(first).toMatchObject({ total: 23, page: 1, pageSize: 20 });
    expect(first.data).toHaveLength(20);
    expect(first.data[0]).toEqual({
      id: 23,
      title: 'Aviso 23',
      message: 'Mensaje 23',
      source: 'MEMBERSHIPS',
      createdAt: expect.any(Date),
      isRead: false,
    });
    expect(second.data.map((n) => n.title)).toEqual([
      'Aviso 3',
      'Aviso 2',
      'Aviso 1',
    ]);
  });

  it('AC2: la campana muestra cuántos avisos sin leer tengo y cada consulta trae el número actual', async () => {
    const f = notificationFixture();
    const controller = new NotificationsController(f.inbox);
    await seed(f, uuid(1), 3);
    expect(await controller.unreadCount(ME)).toEqual({ unread: 3 });

    // Llega un aviso nuevo: la siguiente consulta (cada 30 s o al presionar "Actualizar") lo cuenta.
    await seed(f, uuid(1), 1);
    expect(await controller.unreadCount(ME)).toEqual({ unread: 4 });
  });

  it('AC3: marcar uno o todos como leídos baja el contador en esa cantidad', async () => {
    const f = notificationFixture();
    const controller = new NotificationsController(f.inbox);
    await seed(f, uuid(1), 5);

    await controller.markRead(2, ME);
    await controller.markRead(2, ME); // otra vez: no cuenta doble
    expect(await controller.unreadCount(ME)).toEqual({ unread: 4 });

    await controller.markAllRead(ME);
    expect(await controller.unreadCount(ME)).toEqual({ unread: 0 });
  });

  it('AC4: sin avisos la bandeja llega vacía (la interfaz muestra "No tienes avisos.")', async () => {
    const f = notificationFixture();
    const page = await new NotificationsController(f.inbox).list(
      { page: 1 } as never,
      ME,
    );

    expect(page).toEqual({ data: [], total: 0, page: 1, pageSize: 20 });
  });

  it('AC5: no puedo ver ni marcar los avisos de otra persona', async () => {
    const f = notificationFixture();
    const controller = new NotificationsController(f.inbox);
    await seed(f, OTHER, 2);

    expect((await controller.list({ page: 1 } as never, ME)).data).toEqual([]);
    expect(await controller.unreadCount(ME)).toEqual({ unread: 0 });
    await expect(controller.markRead(1, ME)).rejects.toThrow(
      new NotFoundException(NOTIFICATION_NOT_FOUND_MESSAGE),
    );
    await controller.markAllRead(ME);
    expect(
      f.rows().filter((r) => r.userId === OTHER && r.readAt === null),
    ).toHaveLength(2);
    expect(rolesAllowed(NotificationsController, 'list')).toEqual(['MEMBER']);
  });
});
