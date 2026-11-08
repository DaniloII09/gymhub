/** Error de dominio: no existe una máquina con ese id. */
export class MachineNotFoundError extends Error {
  constructor(public readonly machineId: number) {
    super(`No existe la máquina ${machineId}.`);
    this.name = 'MachineNotFoundError';
  }
}
