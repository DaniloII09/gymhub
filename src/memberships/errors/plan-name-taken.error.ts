/**
 * Error de dominio: ya existe un plan con ese nombre, sin distinguir
 * mayúsculas. Lo lanza el repositorio al chocar con el índice único.
 */
export class PlanNameTakenError extends Error {
  constructor(public readonly planName: string) {
    super(`Ya existe un plan llamado "${planName}".`);
    this.name = 'PlanNameTakenError';
  }
}
