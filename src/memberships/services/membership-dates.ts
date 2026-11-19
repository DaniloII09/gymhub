/**
 * Fechas solo-día de las membresías (AAAA-MM-DD).
 *
 * "Hoy" es la fecha del gimnasio (America/El_Salvador) tomada del reloj del
 * servidor, no CURRENT_DATE de Postgres, que puede estar en UTC: a las 7 p. m.
 * en El Salvador, en UTC ya es el día siguiente. Mismo criterio que Pagos.
 */
export const GYM_TIME_ZONE = 'America/El_Salvador';

/** Desfase de El Salvador respecto de UTC (no tiene horario de verano). */
const GYM_UTC_OFFSET = '-06:00';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function gymToday(now: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: GYM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Suma días a una fecha AAAA-MM-DD sin pasar por la hora local. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Días de `from` a `to` (negativo si `to` es anterior). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / MS_PER_DAY,
  );
}

/** Valor para una columna @db.Date: Prisma la guarda y la lee a medianoche UTC. */
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Lo contrario de toDbDate. */
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Último instante con acceso de un día del gimnasio. Es lo que viaja en el
 * contrato de estado: quien lo formatee en la zona del gimnasio (como H05) ve
 * el mismo día. Medianoche UTC se mostraría como el día anterior en El Salvador.
 */
export function endOfGymDay(date: string): Date {
  return new Date(`${date}T23:59:59.999${GYM_UTC_OFFSET}`);
}
