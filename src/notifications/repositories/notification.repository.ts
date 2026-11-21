import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { NotificationNotFoundError } from '@Notifications/errors';
import type { Notification, NotificationSource, Prisma } from '@PrismaClient';

export interface FindInboxPageData {
  userId: string;
  skip: number;
  take: number;
}

export interface CreateNotificationsData {
  userIds: string[];
  source: NotificationSource;
  title: string;
  message: string;
  referenceId?: string;
}

/**
 * Único punto del sistema que escribe en la tabla `notifications`.
 *
 * Las operaciones de H24 reciben la transacción del módulo que llama, así el
 * aviso se guarda o se descarta junto con la operación que lo originó. Las de
 * la bandeja (H25) siempre filtran por el usuario dueño del aviso.
 */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Cuántos de esos ids son usuarios existentes y activos. */
  countActiveUsers(
    userIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    return tx.user.count({ where: { id: { in: userIds }, isActive: true } });
  }

  /** Inserta un aviso por destinatario y devuelve cuántos se crearon. */
  async createMany(
    { userIds, ...notification }: CreateNotificationsData,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await tx.notification.createMany({
      data: userIds.map((userId) => ({ ...notification, userId })),
    });
    return count;
  }

  /** Página de avisos del usuario, del más reciente al más antiguo, con el total. */
  async findInboxPage({ userId, skip, take }: FindInboxPageData): Promise<{
    notifications: Notification[];
    total: number;
  }> {
    const where = { userId };
    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        // El id desempata avisos creados en el mismo instante (un notify a
        // varios usuarios los crea juntos).
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { notifications, total };
  }

  /** Avisos sin leer del usuario: COUNT con readAt vacío. */
  countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /**
   * Marca como leído un aviso del usuario. Si ya estaba leído no cambia nada
   * (conserva la fecha en que se leyó por primera vez).
   *
   * @throws {NotificationNotFoundError} si el aviso no existe o es de otro usuario.
   */
  async markRead(notificationId: number, userId: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count > 0) return;

    const exists = await this.prisma.notification.count({
      where: { id: notificationId, userId },
    });
    if (exists === 0) throw new NotificationNotFoundError(notificationId);
  }

  /** Marca como leídos todos los avisos sin leer del usuario. */
  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }
}
