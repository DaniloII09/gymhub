/**
 * Error de dominio (H14): el miembro no tiene membresía vigente y recepción no
 * escribió el motivo para dejarlo pasar.
 */
export class ExceptionReasonRequiredError extends Error {
  constructor(public readonly memberId: string) {
    super('Escribe el motivo para dejarlo pasar.');
    this.name = 'ExceptionReasonRequiredError';
  }
}
