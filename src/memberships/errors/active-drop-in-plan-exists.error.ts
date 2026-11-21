/**
 * Error de dominio: ya hay un plan DROP_IN activo y la base solo permite uno
 * (índice único parcial de DB-3.1).
 */
export class ActiveDropInPlanExistsError extends Error {
  constructor() {
    super('Ya existe un plan de clase suelta activo.');
    this.name = 'ActiveDropInPlanExistsError';
  }
}
