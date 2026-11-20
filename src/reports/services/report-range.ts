// Reglas del rango de fechas de los reportes del administrador. Las comparten
// H29 (ingresos de un periodo) y H28 (ocupación de las clases): las fechas son
// solo-día (YYYY-MM-DD) en el calendario del gimnasio y el rango es de hasta
// 12 meses.

/** Formato solo-día. Que la fecha exista (no 2026-02-30) lo revisa `isRealDate`. */
export const REPORT_DATE_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const MAX_RANGE_MONTHS = 12;

export const REPORT_DATE_FORMAT_MESSAGE =
  'Las fechas deben tener el formato AAAA-MM-DD.';
export const RANGE_ORDER_MESSAGE =
  'La fecha de inicio no puede ser posterior a la de fin.';
export const RANGE_TOO_LONG_MESSAGE = 'El rango no puede ser mayor a 12 meses.';

export function invalidDateMessage(date: string): string {
  return `La fecha ${date} no existe.`;
}

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year, month, day];
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** true si la fecha YYYY-MM-DD existe en el calendario. */
export function isRealDate(date: string): boolean {
  if (!REPORT_DATE_PATTERN.test(date)) return false;
  const [year, month, day] = parts(date);
  return day <= daysInMonth(year, month);
}

/**
 * Suma meses a una fecha. Si el día no existe en el mes de destino se usa el
 * último día del mes: 2026-01-31 + 1 mes = 2026-02-28.
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = parts(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return format(
    targetYear,
    targetMonth,
    Math.min(day, daysInMonth(targetYear, targetMonth)),
  );
}

/**
 * Motivo por el que el rango no sirve, o null si está bien.
 *
 * "Hasta 12 meses": el fin tiene que ser anterior a la misma fecha del año
 * siguiente. Del 2026-01-01 al 2026-12-31 sí; del 2026-01-01 al 2027-01-01 no.
 * Las fechas YYYY-MM-DD se comparan como texto porque ordenan igual.
 */
export function reportRangeError(from: string, to: string): string | null {
  for (const date of [from, to]) {
    if (!REPORT_DATE_PATTERN.test(date)) return REPORT_DATE_FORMAT_MESSAGE;
    if (!isRealDate(date)) return invalidDateMessage(date);
  }
  if (from > to) return RANGE_ORDER_MESSAGE;
  if (to >= addMonths(from, MAX_RANGE_MONTHS)) return RANGE_TOO_LONG_MESSAGE;
  return null;
}

/** Meses (YYYY-MM) que toca el rango, del primero al último. */
export function monthsInRange(from: string, to: string): string[] {
  const [fromYear, fromMonth] = parts(from);
  const [toYear, toMonth] = parts(to);
  const months: string[] = [];
  for (
    let index = fromYear * 12 + fromMonth - 1;
    index <= toYear * 12 + toMonth - 1;
    index++
  ) {
    months.push(
      `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`,
    );
  }
  return months;
}
