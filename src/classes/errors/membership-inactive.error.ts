export class MembershipInactiveError extends Error {
  constructor() {
    super('Necesitas una membresía activa para reservar.');
    this.name = 'MembershipInactiveError';
  }
}
