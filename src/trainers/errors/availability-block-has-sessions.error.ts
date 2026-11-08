export class AvailabilityBlockHasSessionsError extends Error {
  constructor(message = 'No se puede eliminar un bloque con una sesión AGENDADA futura') {
    super(message);
    this.name = 'AvailabilityBlockHasSessionsError';
  }
}