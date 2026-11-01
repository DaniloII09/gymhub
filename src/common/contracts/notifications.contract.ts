import type { User } from '@PrismaClient';

/**
 * Contrato del servicio central de notificaciones (Épica 9 · H33, dueño: Juan
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
  | 'REVIEWS';

export interface NotifyInput {
  userIds: User['id'][];
  source: NotificationSource;
  title: string;
  message: string;
  /** Ruta del front, ej. "/me/membership". Opcional. */
  link?: string;
  /** Clave de idempotencia opcional para no repetir el mismo aviso. */
  dedupeKey?: string;
}

export interface NotificationService {
  notify(input: NotifyInput): Promise<void>;
}

/** Token de inyección. El dueño del módulo registra el provider con este token. */
export const NOTIFICATION_SERVICE = Symbol('NotificationService');
