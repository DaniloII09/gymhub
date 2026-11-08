/**
 * Error de dominio: otro administrador cambió el estado de la máquina entre la
 * lectura y la escritura de este cambio, así que se descarta para no registrar
 * un historial con un estado de origen equivocado.
 */
export class MachineStatusConflictError extends Error {
  constructor(public readonly machineId: number) {
    super(`El estado de la máquina ${machineId} cambió durante la operación.`);
    this.name = 'MachineStatusConflictError';
  }
}
