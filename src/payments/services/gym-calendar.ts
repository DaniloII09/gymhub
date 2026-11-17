/** Zona horaria del gimnasio: la misma con la que se imprimen los comprobantes. */
export const GYM_TIME_ZONE = 'America/El_Salvador';

/**
 * Fecha de hoy (YYYY-MM-DD) en la zona del gimnasio, tomada del reloj del
 * servidor. Se usa en vez de CURRENT_DATE de Postgres porque la base puede
 * estar en UTC: a las 7 p. m. en El Salvador, en UTC ya es el día siguiente.
 */
export function gymToday(now: Date = new Date()): string {
  // en-CA formatea las fechas como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: GYM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
