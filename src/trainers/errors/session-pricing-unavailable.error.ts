export class SessionPricingUnavailableError extends Error {
  constructor() {
    super('El precio de la sesión personal todavía no ha sido configurado.');
    this.name = 'SessionPricingUnavailableError';
  }
}
