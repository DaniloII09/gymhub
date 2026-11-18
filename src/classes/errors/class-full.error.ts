export class ClassFullError extends Error {
  constructor(public readonly classId: number) {
    super('La clase está llena.');
    this.name = 'ClassFullError';
  }
}
