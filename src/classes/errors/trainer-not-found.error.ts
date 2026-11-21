export class TrainerNotFoundError extends Error {
  constructor(public readonly trainerId: string) {
    super(`Trainer ${trainerId} not found`);
    this.name = 'TrainerNotFoundError';
  }
}

