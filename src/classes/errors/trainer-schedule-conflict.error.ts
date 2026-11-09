export interface ScheduleConflictTarget {
  kind: 'CLASS' | 'PERSONAL_SESSION';
  id: number;
  name?: string;
  startsAt: Date;
  endsAt: Date;
}

function formatUtcTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export class TrainerScheduleConflictError extends Error {
  constructor(public readonly conflict: ScheduleConflictTarget) {
    const range = `${formatUtcTime(conflict.startsAt)} a ${formatUtcTime(conflict.endsAt)}`;
    const detail =
      conflict.kind === 'CLASS'
        ? `la clase "${conflict.name ?? `#${conflict.id}`}" (${range})`
        : `la sesión personal #${conflict.id} (${range})`;

    super(
      `El entrenador ya tiene asignada ${detail} que se cruza con ese horario.`,
    );
    this.name = 'TrainerScheduleConflictError';
  }
}

