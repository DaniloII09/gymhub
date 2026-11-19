/**
 * Error de dominio: el miembro ya registró su ingreso hace menos de 30
 * minutos. Evita registrar dos veces el mismo ingreso.
 */
export class RecentCheckInError extends Error {
  constructor(public readonly memberId: string) {
    super('Este miembro ya registró su ingreso hace menos de 30 minutos.');
    this.name = 'RecentCheckInError';
  }
}
