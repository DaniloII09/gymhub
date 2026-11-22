import { NotificationRepository } from '../../src/notifications/repositories/notification.repository.js';
import { NotificationsService } from '../../src/notifications/services/notifications.service.js';
import { NotificationInboxService } from '../../src/notifications/services/notification-inbox.service.js';

export const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface Row {
  id: number;
  userId: string;
  source: string;
  title: string;
  message: string;
  referenceId?: string;
  createdAt: Date;
  readAt: Date | null;
}

/**
 * Tabla `notifications` en memoria con los servicios reales de H24 y H25.
 * `prisma.$transaction(fn)` revierte lo que se escribió si `fn` falla, como la
 * transacción de la base.
 */
export function notificationFixture({ activeUsers = 1000 } = {}) {
  let rows: Row[] = [];
  let clock = Date.parse('2026-11-19T12:00:00.000Z');
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => r[k as keyof Row] === v);

  const notification = {
    createMany: vi.fn(
      async ({
        data,
      }: {
        data: Omit<Row, 'id' | 'createdAt' | 'readAt'>[];
      }) => {
        for (const d of data)
          rows.push({
            id: rows.length + 1,
            createdAt: new Date((clock += 1000)),
            readAt: null,
            ...d,
          });
        return { count: data.length };
      },
    ),
    findMany: vi.fn(async ({ where, skip, take }) =>
      rows
        .filter((r) => matches(r, where))
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
        )
        .slice(skip, skip + take),
    ),
    count: vi.fn(
      async ({ where }) => rows.filter((r) => matches(r, where)).length,
    ),
    updateMany: vi.fn(async ({ where, data }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
  };
  const tx = {
    user: {
      count: vi.fn(async ({ where }) =>
        Math.min(where.id.in.length, activeUsers),
      ),
    },
    notification,
  };
  const prisma = {
    notification,
    $transaction: vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const snapshot = rows.map((r) => ({ ...r }));
      try {
        return await (arg as (t: typeof tx) => unknown)(tx);
      } catch (error) {
        rows = snapshot;
        throw error;
      }
    }),
  };
  const repository = new NotificationRepository(prisma as never);
  return {
    rows: () => rows,
    tx,
    prisma,
    notifications: new NotificationsService(repository),
    inbox: new NotificationInboxService(repository),
  };
}
