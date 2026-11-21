import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OccupancyRepository, type OccupancyRow } from '@Reports/repositories';
import { reportRangeError } from './report-range.js';

export const NO_CLASSES_MESSAGE = 'No hay clases en ese rango.';

/** Con al menos estas clases se resaltan las 3 de mayor y las 3 de menor ocupación. */
export const HIGHLIGHT_MIN_CLASSES = 6;
export const HIGHLIGHT_COUNT = 3;

export type OccupancyLevel = 'HIGH' | 'LOW';

/** Ocupación de las clases con un mismo nombre en el rango. */
export interface ClassOccupancy {
  name: string;
  /** Clases con ese nombre que cuentan para el reporte. */
  sessions: number;
  /** Suma del cupo máximo de esas clases. */
  capacity: number;
  /** Suma de sus reservas confirmadas. */
  confirmedReservations: number;
  /** confirmedReservations / capacity × 100, con un decimal. */
  occupancyPercent: number;
  /** HIGH: de mayor ocupación; LOW: de menor; null: en medio, sin resaltar. */
  level: OccupancyLevel | null;
}

export interface OccupancyTotals {
  /** Clases distintas (por nombre). */
  classCount: number;
  sessions: number;
  capacity: number;
  confirmedReservations: number;
  /** Ocupación de todas las clases juntas, con un decimal. */
  occupancyPercent: number;
}

export interface OccupancyReport {
  from: string;
  to: string;
  totals: OccupancyTotals;
  /** De mayor a menor ocupación; empates por nombre en orden alfabético. */
  classes: ClassOccupancy[];
}

/** Porcentaje con un decimal, sin errores de coma flotante en el redondeo. */
export function occupancyPercent(confirmed: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.round((confirmed * 1000) / capacity) / 10;
}

const byName = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Mayor ocupación primero; con el mismo porcentaje, por nombre (A-Z). */
export function compareOccupancy(
  a: Pick<ClassOccupancy, 'name' | 'occupancyPercent'>,
  b: Pick<ClassOccupancy, 'name' | 'occupancyPercent'>,
): number {
  return (
    b.occupancyPercent - a.occupancyPercent ||
    byName.compare(a.name, b.name) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  );
}

/**
 * Nivel de cada posición de la lista ya ordenada:
 *
 * - 6 clases o más: las 3 primeras HIGH, las 3 últimas LOW y el resto null.
 * - Menos de 6: la mitad superior HIGH y el resto LOW. Con un número impar la
 *   clase del medio queda en la mitad superior (5 clases: 3 HIGH y 2 LOW).
 *
 * Ninguna clase recibe los dos niveles.
 */
export function occupancyLevel(
  index: number,
  count: number,
): OccupancyLevel | null {
  if (count >= HIGHLIGHT_MIN_CLASSES) {
    if (index < HIGHLIGHT_COUNT) return 'HIGH';
    if (index >= count - HIGHLIGHT_COUNT) return 'LOW';
    return null;
  }
  return index < Math.ceil(count / 2) ? 'HIGH' : 'LOW';
}

/** Arma el reporte con las sumas de la base, o null si no hay clases. */
export function buildOccupancyReport(
  from: string,
  to: string,
  rows: OccupancyRow[],
): OccupancyReport | null {
  if (rows.length === 0) return null;

  const sorted = rows
    .map((row) => ({
      name: row.name,
      sessions: row.sessions,
      capacity: row.capacity,
      confirmedReservations: row.confirmed,
      occupancyPercent: occupancyPercent(row.confirmed, row.capacity),
    }))
    .sort(compareOccupancy);

  const classes = sorted.map((item, index) => ({
    ...item,
    level: occupancyLevel(index, sorted.length),
  }));

  const sum = (pick: (item: ClassOccupancy) => number) =>
    classes.reduce((total, item) => total + pick(item), 0);
  const capacity = sum((item) => item.capacity);
  const confirmedReservations = sum((item) => item.confirmedReservations);

  return {
    from,
    to,
    totals: {
      classCount: classes.length,
      sessions: sum((item) => item.sessions),
      capacity,
      confirmedReservations,
      occupancyPercent: occupancyPercent(confirmedReservations, capacity),
    },
    classes,
  };
}

/** Ocupación de las clases (H28). Solo Administrador. */
@Injectable()
export class OccupancyReportService {
  constructor(private readonly occupancyRepository: OccupancyRepository) {}

  async getOccupancy(from: string, to: string): Promise<OccupancyReport> {
    const problem = reportRangeError(from, to);
    if (problem) throw new BadRequestException(problem);

    const rows = await this.occupancyRepository.occupancyByClassName(from, to);
    const report = buildOccupancyReport(from, to, rows);
    if (!report) throw new NotFoundException(NO_CLASSES_MESSAGE);
    return report;
  }
}
