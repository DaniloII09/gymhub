export class ClassNotScheduledError extends Error {
  constructor(public readonly classId: number) {
    super(`GymClass ${classId} is not in SCHEDULED status`);
    this.name = 'ClassNotScheduledError';
  }
}

