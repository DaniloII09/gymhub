export class DuplicateProgressDateError extends Error {
  constructor() {
    super('Ya tienes un registro en esa fecha.');
    this.name = 'DuplicateProgressDateError';
  }
}

export class ProgressEntryNotFoundError extends Error {
  constructor() {
    super('No encontramos ese registro de progreso.');
    this.name = 'ProgressEntryNotFoundError';
  }
}
