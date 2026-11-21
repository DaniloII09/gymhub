/**
 * Zona horaria del gimnasio (El Salvador, UTC-06:00 sin horario de verano).
 * Mismo criterio que Pagos, Membresías y Entrenadores.
 */
export const GYM_TIME_ZONE = 'America/El_Salvador';
const GYM_UTC_OFFSET = '-06:00';
export const REVIEW_WINDOW_DAYS = 7;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: GYM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha calendario (`YYYY-MM-DD`) en la zona horaria del gimnasio. */
export function gymDateString(date: Date): string {
  return dateFormatter.format(date);
}

/** Suma `days` días calendario (admite negativos) a una fecha `YYYY-MM-DD`. */
export function addGymDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inicio del día del gimnasio (`00:00:00.000-06:00`). */
export function startOfGymDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000${GYM_UTC_OFFSET}`);
}

/** Fin del día del gimnasio (`23:59:59.999-06:00`). */
export function endOfGymDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999${GYM_UTC_OFFSET}`);
}

/** Último día calendario del gimnasio (YYYY-MM-DD) en que se puede calificar. */
export function reviewDeadlineDate(endsAt: Date): string {
  return addGymDays(gymDateString(endsAt), REVIEW_WINDOW_DAYS);
}

/**
 * true si `now` está dentro de la ventana de calificación: desde que termina la
 * clase/sesión (`endsAt <= now`) hasta el final del séptimo día calendario
 * posterior en la zona del gimnasio.
 */
export function isWithinReviewWindow(endsAt: Date, now: Date): boolean {
  if (now.getTime() < endsAt.getTime()) return false;
  const deadline = endOfGymDay(reviewDeadlineDate(endsAt));
  return now.getTime() <= deadline.getTime();
}

/**
 * Límite inferior de `endsAt` para buscar posibles clases/sesiones calificables
 * dentro de los últimos 7 días del gimnasio.
 */
export function earliestReviewableEndsAt(now: Date): Date {
  const earliestDay = addGymDays(gymDateString(now), -REVIEW_WINDOW_DAYS);
  return startOfGymDay(earliestDay);
}
