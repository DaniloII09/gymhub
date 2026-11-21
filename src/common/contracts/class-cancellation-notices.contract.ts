import type { Prisma } from '@PrismaClient';

/**
 * Contrato del aviso de clase cancelada (Épica 9 · H27, dueño: Juan Carlos).
 * Lo consume H09 (cancelar una clase, dueño: Luis).
 *
 * Uso desde H09, dentro de la misma transacción que cancela la clase y ANTES
 * de pasar las reservas a "Cancelada por el gimnasio", porque se avisa a las
 * reservas que en ese momento siguen confirmadas:
 *
 *   await this.prisma.$transaction(async (tx) => {
 *     await this.notifier.notifyClassCancelled({ classId, reason }, tx);
 *     // ...cancelar la clase y sus reservas
 *   });
 *
 * Si la transacción se revierte, no queda ningún aviso.
 */
export interface ClassCancellationNoticeInput {
  classId: number;
  /** Motivo que escribió el administrador (H09 valida de 5 a 200 caracteres). */
  reason: string;
}

export interface ClassCancellationNotifier {
  /** Avisa a los miembros con reserva confirmada y devuelve cuántos avisos creó. */
  notifyClassCancelled(
    input: ClassCancellationNoticeInput,
    tx: Prisma.TransactionClient,
  ): Promise<number>;
}

/** Token de inyección; lo registra NotificationsModule. */
export const CLASS_CANCELLATION_NOTIFIER = Symbol('ClassCancellationNotifier');
