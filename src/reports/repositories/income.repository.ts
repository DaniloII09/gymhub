import { Injectable } from '@nestjs/common';
import { Prisma, type ChargeType } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { GYM_TIME_ZONE } from '@Payments/services';

/** Lo cobrado en un mes por un tipo de cobro. */
export interface IncomeRow {
  /** YYYY-MM en el calendario del gimnasio. */
  month: string;
  type: ChargeType;
  amount: number;
  receipts: number;
}

/**
 * Ingresos de H29. No tiene tablas propias: suma los comprobantes de Pagos
 * (H15 y H16). Un comprobante existe solo si el pago fue aprobado, y el monto
 * es el del cobro que pagó.
 */
@Injectable()
export class IncomeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Suma por mes y por tipo los comprobantes emitidos entre `from` y `to`
   * (fechas YYYY-MM-DD, ambas incluidas).
   *
   * El filtro es por la fecha de emisión del comprobante en la zona del
   * gimnasio, no por el vencimiento del cobro: así el total coincide con los
   * comprobantes del rango. issued_at se guarda en UTC sin zona, por eso se
   * convierte primero a UTC y luego a la hora de El Salvador.
   */
  async incomeByMonthAndType(from: string, to: string): Promise<IncomeRow[]> {
    const issuedLocal = Prisma.sql`timezone(${GYM_TIME_ZONE}, r.issued_at AT TIME ZONE 'UTC')`;
    const rows = await this.prisma.$queryRaw<
      {
        month: string;
        type: ChargeType;
        amount: Prisma.Decimal;
        receipts: number;
      }[]
    >`
      SELECT to_char(${issuedLocal}, 'YYYY-MM') AS month,
             c.type,
             SUM(c.amount) AS amount,
             COUNT(*)::int AS receipts
        FROM receipts r
        JOIN charges c ON c.id = r.charge_id
       WHERE ${issuedLocal}::date BETWEEN ${from}::date AND ${to}::date
       GROUP BY 1, 2
       ORDER BY 1, 2`;

    return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
  }
}
