/** Error de dominio: no existe un plan con ese id. */
export class PlanNotFoundError extends Error {
  constructor(public readonly planId: number) {
    super(`No existe el plan ${planId}.`);
    this.name = 'PlanNotFoundError';
  }
}
