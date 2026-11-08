export class ClassNotFoundError extends Error {
  constructor(public readonly classId: number) {
    super(`GymClass ${classId} not found`);
    this.name = 'ClassNotFoundError';
  }
}
