export class AlreadyReservedError extends Error {
  constructor(
    public readonly classId: number,
    public readonly memberId: string,
  ) {
    super('Ya tienes una reserva en esta clase.');
    this.name = 'AlreadyReservedError';
  }
}
