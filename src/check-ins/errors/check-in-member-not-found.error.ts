/** Error de dominio: no existe un miembro activo con ese id. */
export class CheckInMemberNotFoundError extends Error {
  constructor(public readonly memberId: string) {
    super(`No existe un miembro activo con id ${memberId}.`);
    this.name = 'CheckInMemberNotFoundError';
  }
}
