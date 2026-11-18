export class MembershipUnavailableError extends Error {
  constructor() {
    super(
      'La verificación de membresías todavía no está disponible (pendiente H04 / BE-4.3).',
    );
    this.name = 'MembershipUnavailableError';
  }
}
