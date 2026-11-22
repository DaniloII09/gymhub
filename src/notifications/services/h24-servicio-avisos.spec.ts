import { NotificationValidationError } from '@Notifications/errors';
import {
  notificationFixture,
  uuid,
} from '../../../test/helpers/notification-fixture.js';

const input = (overrides: object = {}) => ({
  recipients: [uuid(1)],
  title: 'Clase cancelada',
  message:
    'La clase Spinning del 19/11/2026 a las 18:00 fue cancelada. Motivo: mantenimiento.',
  source: 'CLASSES',
  referenceId: 'class:4',
  ...overrides,
});

describe('H24. Enviar avisos desde cualquier módulo', () => {
  it('AC1: el aviso registrado con título, mensaje, origen y referencia aparece en la bandeja de cada destinatario', async () => {
    const { notifications, inbox, tx } = notificationFixture();

    const created = await notifications.notify(
      input({ recipients: [uuid(1), uuid(2)] }) as never,
      tx as never,
    );

    expect(created).toBe(2);
    for (const user of [uuid(1), uuid(2)]) {
      const page = await inbox.list(user, 1);
      expect(page.data).toEqual([
        expect.objectContaining({
          userId: user,
          title: 'Clase cancelada',
          source: 'CLASSES',
          referenceId: 'class:4',
          readAt: null,
        }),
      ]);
    }
    // La referencia es opcional.
    await expect(
      notifications.notify(
        input({ referenceId: undefined }) as never,
        tx as never,
      ),
    ).resolves.toBe(1);
  });

  it('AC2: una sola llamada con 30 destinatarios registra 30 avisos', async () => {
    const { notifications, tx, rows } = notificationFixture();
    const recipients = Array.from({ length: 30 }, (_, i) => uuid(i + 1));

    await expect(
      notifications.notify(input({ recipients }) as never, tx as never),
    ).resolves.toBe(30);
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    expect(new Set(rows().map((r) => r.userId)).size).toBe(30);
  });

  it('AC3: sin destinatarios o sin título no se registra y el módulo recibe el error', async () => {
    const { notifications, tx, rows } = notificationFixture();

    await expect(
      notifications.notify(input({ recipients: [] }) as never, tx as never),
    ).rejects.toThrow(
      new NotificationValidationError(
        'El aviso necesita al menos un destinatario.',
      ),
    );
    await expect(
      notifications.notify(input({ title: '   ' }) as never, tx as never),
    ).rejects.toThrow(NotificationValidationError);
    await expect(
      notifications.notify(input({ title: undefined }) as never, tx as never),
    ).rejects.toThrow(
      'El título del aviso debe tener entre 1 y 80 caracteres.',
    );
    expect(rows()).toHaveLength(0);
  });

  it('AC4: un módulo de origen fuera de la lista no registra el aviso', async () => {
    const { notifications, tx, rows } = notificationFixture();

    await expect(
      notifications.notify(
        input({ source: 'MARKETING' }) as never,
        tx as never,
      ),
    ).rejects.toThrow(
      new NotificationValidationError(
        'El módulo de origen "MARKETING" no está en la lista de módulos.',
      ),
    );
    expect(rows()).toHaveLength(0);
  });

  it('AC5: si la operación del módulo que llama falla y se revierte, no queda ningún aviso', async () => {
    const { notifications, prisma, rows } = notificationFixture();

    await expect(
      prisma.$transaction(async (tx: never) => {
        await notifications.notify(
          input({ recipients: [uuid(1), uuid(2)] }) as never,
          tx,
        );
        throw new Error('falló la cancelación de la clase');
      }),
    ).rejects.toThrow('falló la cancelación de la clase');

    expect(rows()).toHaveLength(0);
  });
});
