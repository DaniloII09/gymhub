import type { AvailabilityBlock } from '@PrismaClient';

/**
 * Zona horaria del gimnasio (la misma que usa Pagos en `gym-calendar.ts`
 * y Notificaciones en H27). El Salvador permanece en UTC-06:00 todo el año.
 */
export const GYM_TIME_ZONE = 'America/El_Salvador';
export const GYM_UTC_OFFSET = '-06:00';
export const SESSION_DURATION_MINUTES = 60;

export interface CandidateSlot {
  availabilityBlockId: string;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: Date;
  endsAt: Date;
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: GYM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: GYM_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Fecha calendario (`YYYY-MM-DD`) en la zona horaria del gimnasio. */
export function gymDateString(date: Date): string {
  return dateFormatter.format(date);
}

/** Hora (`HH:mm`) en la zona horaria del gimnasio. */
export function gymTimeString(date: Date): string {
  return timeFormatter.format(date);
}

/** Día de la semana ISO (`1` = Lunes ... `7` = Domingo) para una fecha calendario del gimnasio. */
export function gymIsoWeekday(dateStr: string): number {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Suma `days` días calendario a una fecha `YYYY-MM-DD`. */
export function addGymDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Convierte `"H:mm"` o `"HH:mm"` en minutos desde medianoche. */
export function parseTimeToMinutes(timeStr: string): number | null {
  const match = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function formatMinutesHHmm(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function dateFromGymDateAndMinutes(
  dateStr: string,
  totalMinutes: number,
): Date {
  const dayStart = new Date(`${dateStr}T00:00:00${GYM_UTC_OFFSET}`);
  return new Date(dayStart.getTime() + totalMinutes * 60_000);
}

/**
 * Genera bloques exactos de 60 minutos en la zona horaria del gimnasio a partir
 * de los bloques de disponibilidad recurrentes (H10), descartando fragmentos
 * menores a 60 minutos y conservando límites de día exactos.
 */
export function generateCandidateSlotsForRange(
  blocks: Pick<AvailabilityBlock, 'id' | 'weekday' | 'startTime' | 'endTime'>[],
  from: Date,
  to: Date,
  now: Date,
): CandidateSlot[] {
  if (blocks.length === 0 || to.getTime() <= from.getTime()) {
    return [];
  }

  const byWeekday = new Map<
    number,
    Pick<AvailabilityBlock, 'id' | 'weekday' | 'startTime' | 'endTime'>[]
  >();
  for (const block of blocks) {
    const existing = byWeekday.get(block.weekday) ?? [];
    existing.push(block);
    byWeekday.set(block.weekday, existing);
  }

  const startDay = gymDateString(from);
  const endDay = gymDateString(
    new Date(Math.max(from.getTime(), to.getTime() - 1)),
  );

  const seenStarts = new Set<number>();
  const slots: CandidateSlot[] = [];

  for (
    let cursorDay = startDay;
    cursorDay <= endDay;
    cursorDay = addGymDays(cursorDay, 1)
  ) {
    const weekday = gymIsoWeekday(cursorDay);
    const dayBlocks = byWeekday.get(weekday);
    if (!dayBlocks) continue;

    for (const block of dayBlocks) {
      const startMinutes = parseTimeToMinutes(block.startTime);
      const endMinutes = parseTimeToMinutes(block.endTime);
      if (startMinutes === null || endMinutes === null) continue;

      for (
        let minute = startMinutes;
        minute + SESSION_DURATION_MINUTES <= endMinutes;
        minute += SESSION_DURATION_MINUTES
      ) {
        const slotStart = dateFromGymDateAndMinutes(cursorDay, minute);
        const slotEnd = new Date(
          slotStart.getTime() + SESSION_DURATION_MINUTES * 60_000,
        );

        if (
          slotStart.getTime() <= now.getTime() ||
          slotStart.getTime() < from.getTime() ||
          slotEnd.getTime() > to.getTime()
        ) {
          continue;
        }

        if (seenStarts.has(slotStart.getTime())) continue;
        seenStarts.add(slotStart.getTime());

        slots.push({
          availabilityBlockId: block.id,
          date: cursorDay,
          startTime: formatMinutesHHmm(minute),
          endTime: formatMinutesHHmm(minute + SESSION_DURATION_MINUTES),
          startsAt: slotStart,
          endsAt: slotEnd,
        });
      }
    }
  }

  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return slots;
}

/**
 * Comprueba si `targetStartsAt` coincide exactamente con el inicio de un
 * espacio de 60 minutos dentro de los bloques del entrenador en la zona
 * horaria del gimnasio.
 */
export function findMatchingAvailabilitySlot(
  blocks: Pick<AvailabilityBlock, 'id' | 'weekday' | 'startTime' | 'endTime'>[],
  targetStartsAt: Date,
): CandidateSlot | null {
  const dateStr = gymDateString(targetStartsAt);
  const weekday = gymIsoWeekday(dateStr);

  for (const block of blocks) {
    if (block.weekday !== weekday) continue;
    const startMinutes = parseTimeToMinutes(block.startTime);
    const endMinutes = parseTimeToMinutes(block.endTime);
    if (startMinutes === null || endMinutes === null) continue;

    for (
      let minute = startMinutes;
      minute + SESSION_DURATION_MINUTES <= endMinutes;
      minute += SESSION_DURATION_MINUTES
    ) {
      const slotStart = dateFromGymDateAndMinutes(dateStr, minute);
      if (slotStart.getTime() === targetStartsAt.getTime()) {
        return {
          availabilityBlockId: block.id,
          date: dateStr,
          startTime: formatMinutesHHmm(minute),
          endTime: formatMinutesHHmm(minute + SESSION_DURATION_MINUTES),
          startsAt: slotStart,
          endsAt: new Date(
            slotStart.getTime() + SESSION_DURATION_MINUTES * 60_000,
          ),
        };
      }
    }
  }

  return null;
}

/** Verifica si dos intervalos `[aStart, aEnd)` y `[bStart, bEnd)` se solapan. */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return (
    aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime()
  );
}
