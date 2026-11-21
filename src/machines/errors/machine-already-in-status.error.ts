import type { MachineStatus } from '@PrismaClient';

/** Error de dominio: se pidió cambiar la máquina al estado que ya tiene. */
export class MachineAlreadyInStatusError extends Error {
  constructor(
    public readonly machineId: number,
    public readonly status: MachineStatus,
  ) {
    super(`La máquina ${machineId} ya está en ${status}.`);
    this.name = 'MachineAlreadyInStatusError';
  }
}
