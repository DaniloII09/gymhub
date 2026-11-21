const WEEKDAY_NAMES = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
  7: 'domingo',
};

export class AvailabilityBlockConflictError extends Error {
  constructor(existingBlock?: { weekday: number; startTime: string; endTime: string }) {
    let message = 'El bloque horario se cruza con uno existente';

    if (existingBlock) {
      const dayName = WEEKDAY_NAMES[existingBlock.weekday] || `día ${existingBlock.weekday}`;
      message = `Se cruza con tu bloque del ${dayName} de ${existingBlock.startTime} a ${existingBlock.endTime}.`;
    }

    super(message);
    this.name = 'AvailabilityBlockConflictError';
  }
}