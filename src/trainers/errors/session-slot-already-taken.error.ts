export class SessionSlotAlreadyTakenError extends Error {
  constructor() {
    super('Ese horario ya fue tomado.');
    this.name = 'SessionSlotAlreadyTakenError';
  }
}
