/** Error de dominio: el cobro ya está PAID y no se puede pagar otra vez. */
export class ChargeAlreadyPaidError extends Error {
  constructor(public readonly chargeId: number) {
    super(`El cobro ${chargeId} ya está pagado.`);
    this.name = 'ChargeAlreadyPaidError';
  }
}
