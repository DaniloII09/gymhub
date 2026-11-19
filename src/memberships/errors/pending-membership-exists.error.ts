/**
 * Error de dominio: el miembro ya tiene una membresía sin pagar que no ha
 * vencido. Registrar otra crearía un segundo cobro por el mismo periodo.
 */
export class PendingMembershipExistsError extends Error {
  constructor(public readonly memberId: string) {
    super('El miembro ya tiene una membresía pendiente de pago.');
    this.name = 'PendingMembershipExistsError';
  }
}
