export class InvalidTrainerRoleError extends Error {
  constructor(public readonly trainerId: string) {
    super('El usuario seleccionado no es un entrenador activo.');
    this.name = 'InvalidTrainerRoleError';
  }
}
