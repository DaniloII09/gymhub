import { Injectable } from '@nestjs/common';
import type { NotificationSource, Prisma } from '@PrismaClient';

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
 * aviso se guarda o se descarta junto con la operación que lo originó.
 */
@Injectable()
export class NotificationRepository {
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
}
