export class DropInMembershipNotAllowedError extends Error {
  constructor() {
    super('La clase suelta se compra en recepción y no permite reservar.');
    this.name = 'DropInMembershipNotAllowedError';
  }
}
