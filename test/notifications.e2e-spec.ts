import { Test } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import {
  NOTIFICATION_SERVICE,
  type NotificationService,
  type NotifyInput,
} from '@Common/contracts';
import { NotificationValidationError } from '@Notifications/errors';
import type { INestApplicationContext } from '@nestjs/common';

/**
 * Prueba de integración de H24 contra la base de datos real.
 *
 * Requiere Postgres levantado y las migraciones aplicadas. Crea 30 miembros
 * temporales (más uno inactivo) y los borra al terminar junto con sus avisos.
 */
const EMAIL_PREFIX = 'h24-e2e-';
const RECIPIENTS = 30;

describe('Avisos · H24 (e2e)', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  let notifications: NotificationService;
  let memberIds: string[];
  let inactiveId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await moduleRef.init();

    prisma = app.get(PrismaService);
    notifications = app.get<NotificationService>(NOTIFICATION_SERVICE);

    await cleanup();
    const created = await prisma.user.createManyAndReturn({
      data: Array.from({ length: RECIPIENTS + 1 }, (_, i) => ({
        email: `${EMAIL_PREFIX}${i}@gymhub.test`,
        fullName: `Miembro H24 ${i}`,
        passwordHash: 'sin-login',
        isActive: i < RECIPIENTS,
      })),
      select: { id: true, isActive: true },
    });
    memberIds = created.filter((u) => u.isActive).map((u) => u.id);
    inactiveId = created.find((u) => !u.isActive)!.id;
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({
      where: { user: { email: { startsWith: EMAIL_PREFIX } } },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup(): Promise<void> {
    const where = { user: { email: { startsWith: EMAIL_PREFIX } } };
    await prisma.notification.deleteMany({ where });
    await prisma.user.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
  }

  const input = (overrides: Partial<NotifyInput> = {}): NotifyInput => ({
    recipients: memberIds,
    source: 'CLASSES',
    title: 'Clase cancelada',
    message: 'La clase Yoga Flow del 14/11/2026 a las 09:00 fue cancelada.',
    referenceId: '42',
    ...overrides,
  });

  const countNotifications = () =>
    prisma.notification.count({
      where: { userId: { in: [...memberIds, inactiveId] } },
    });

  it('con 30 destinatarios en una sola llamada registra 30 avisos, uno por miembro', async () => {
    const created = await prisma.$transaction((tx) =>
      notifications.notify(input(), tx),
    );

    expect(created).toBe(RECIPIENTS);
    const rows = await prisma.notification.findMany({
      where: { userId: { in: memberIds } },
    });
    expect(rows).toHaveLength(RECIPIENTS);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set(memberIds));
    expect(rows[0]).toMatchObject({
      source: 'CLASSES',
      title: 'Clase cancelada',
      referenceId: '42',
      readAt: null,
    });
  });

  it('si la transacción de quien llama se revierte, no queda ningún aviso', async () => {
    const failure = new Error('falló la operación del módulo');

    await expect(
      prisma.$transaction(async (tx) => {
        await notifications.notify(input(), tx);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await countNotifications()).toBe(0);
  });

  it('sin título lanza el error y no registra avisos', async () => {
    await expect(
      prisma.$transaction((tx) =>
        notifications.notify(input({ title: '' }), tx),
      ),
    ).rejects.toBeInstanceOf(NotificationValidationError);

    expect(await countNotifications()).toBe(0);
  });

  it('sin destinatarios lanza el error y no registra avisos', async () => {
    await expect(
      prisma.$transaction((tx) =>
        notifications.notify(input({ recipients: [] }), tx),
      ),
    ).rejects.toBeInstanceOf(NotificationValidationError);

    expect(await countNotifications()).toBe(0);
  });

  it('con un módulo de origen fuera de la lista no registra el aviso', async () => {
    await expect(
      prisma.$transaction((tx) =>
        notifications.notify(
          input({ source: 'ADMINISTRACION' as NotifyInput['source'] }),
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(NotificationValidationError);

    expect(await countNotifications()).toBe(0);
  });

  it('si un destinatario está inactivo no registra el aviso a nadie', async () => {
    await expect(
      prisma.$transaction((tx) =>
        notifications.notify(
          input({ recipients: [...memberIds, inactiveId] }),
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(NotificationValidationError);

    expect(await countNotifications()).toBe(0);
  });

  it('la base rechaza un módulo de origen que no está en el enum', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO notifications (user_id, title, message, source)
        VALUES (${memberIds[0]}::uuid, 'x', 'x', 'ADMINISTRACION')`,
    ).rejects.toThrow();
  });
});
