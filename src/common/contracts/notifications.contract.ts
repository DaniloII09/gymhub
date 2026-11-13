import type { User, Prisma } from '@PrismaClient';

/**
 * Contrato del servicio central de notificaciones (Épica 9 · H24, dueño: Juan
 * Carlos). Requerimiento no funcional: TODOS los módulos generan sus avisos a
 * través de este servicio; ninguno construye su propia lógica de envío ni
 * guarda avisos en una tabla propia.
 *
 * Quien dispara un aviso depende de ESTA interfaz, no de la implementación.
 */
export type NotificationSource =
  | 'MEMBERSHIPS'
  | 'CHECK_INS'
  | 'CLASSES'
  | 'TRAINERS'
  | 'PAYMENTS'
  | 'ROUTINES'
  | 'MACHINES'
  | 'REVIEWS'
  | 'REPORTS';

export interface NotifyInput {
  recipients: User['id'][];
  source: NotificationSource;
  title: string;
  message: string;
  referenceId?: string;
}

export interface NotificationService {
  notify(input: NotifyInput, tx: Prisma.TransactionClient): Promise<number>;
}

/** Token de inyección. El dueño del módulo registra el provider con este token. */
export const NOTIFICATION_SERVICE = Symbol('NotificationService');
