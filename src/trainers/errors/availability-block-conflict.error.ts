export class AvailabilityBlockConflictError extends Error {
  constructor(message = 'El bloque horario se cruza con uno existente') {
    super(message);
    this.name = 'AvailabilityBlockConflictError';
  }
}