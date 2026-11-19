/**
 * Error de dominio: la pasarela rechazó el pago de la clase suelta. Se lanza
 * dentro de la transacción para revertirla: no queda ni membresía, ni reserva,
 * ni cobro.
 */
export class DropInPaymentDeclinedError extends Error {
  constructor(public readonly declineReason: string) {
    super(declineReason);
    this.name = 'DropInPaymentDeclinedError';
  }
}
