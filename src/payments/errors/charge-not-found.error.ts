/** Error de dominio: no existe un cobro con ese id. */
export class ChargeNotFoundError extends Error {
  constructor(public readonly chargeId: number) {
    super(`No existe el cobro ${chargeId}.`);
    this.name = 'ChargeNotFoundError';
  }
}
