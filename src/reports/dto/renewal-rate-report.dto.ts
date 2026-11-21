import { ApiProperty } from '@nestjs/swagger';
import { ReportRangeQueryDto } from './report-range-query.dto.js';

/** Query de GET /api/v1/reports/renewal-rate (BE-30.1). */
export class RenewalRateReportQueryDto extends ReportRangeQueryDto {}

export class RenewalRateSummaryDto {
  @ApiProperty({ example: 120, description: 'Membresías Mensuales y Trimestrales vencidas.' })
  expiredCount!: number;

  @ApiProperty({ example: 87, description: 'Membresías vencidas renovadas dentro de 7 días.' })
  renewedCount!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 72.5,
    description: 'Porcentaje renovadas / vencidas × 100 con un decimal; null si no hubo vencimientos.',
  })
  renewalRate!: number | null;
}

export class RenewalRateMonthDto extends RenewalRateSummaryDto {
  @ApiProperty({ example: '2026-11', description: 'Mes (YYYY-MM).' })
  month!: string;
}

/** Respuesta de GET /api/v1/reports/renewal-rate (BE-30.1). */
export class RenewalRateReportDto {
  @ApiProperty({ example: '2026-09-01' })
  from!: string;

  @ApiProperty({ example: '2026-11-30' })
  to!: string;

  @ApiProperty({ type: RenewalRateSummaryDto })
  totals!: RenewalRateSummaryDto;

  @ApiProperty({
    type: [RenewalRateMonthDto],
    description: 'Todos los meses del rango en orden; renewalRate es null si no hubo vencimientos ese mes.',
  })
  months!: RenewalRateMonthDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: '"No hay membresías vencidas en ese rango." si no hay vencimientos en todo el rango; si no, null.',
  })
  message!: string | null;
}
