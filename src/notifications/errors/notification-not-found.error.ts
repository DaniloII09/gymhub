/**
 * Error de dominio: no existe un aviso con ese id para este usuario. Un aviso
 * de otra persona responde igual que uno inexistente, para no revelar que
 * existe.
 */
export class NotificationNotFoundError extends Error {
  constructor(public readonly notificationId: number) {
    super(`No existe el aviso ${notificationId} para este usuario.`);
    this.name = 'NotificationNotFoundError';
  }
}
