export class TrainerNotFoundError extends Error {
  constructor(public readonly trainerId: string) {
    super('No encontramos al entrenador seleccionado.');
    this.name = 'TrainerNotFoundError';
  }
}
