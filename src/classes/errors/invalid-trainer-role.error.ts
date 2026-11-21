export class InvalidTrainerRoleError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} does not have role TRAINER`);
    this.name = 'InvalidTrainerRoleError';
  }
}

