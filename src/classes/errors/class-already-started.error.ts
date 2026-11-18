export class ClassAlreadyStartedError extends Error {
  constructor(public readonly classId: number) {
    super('No se puede reservar una clase que ya comenzó.');
    this.name = 'ClassAlreadyStartedError';
  }
}
