import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import {
  REPORT_DATE_FORMAT_MESSAGE,
  REPORT_DATE_PATTERN,
} from '@Reports/services';

/** Query de GET /api/v1/reports/renewal-rate (BE-30.1). */
export class RenewalRateReportQueryDto {
  @ApiProperty({
    example: '2026-09-01',
    description: 'Primer día del rango (YYYY-MM-DD), incluido.',
  })
  @Matches(REPORT_DATE_PATTERN, { message: REPORT_DATE_FORMAT_MESSAGE })
  from!: string;

  @ApiProperty({
    example: '2026-11-30',
    description:
      'Último día del rango (YYYY-MM-DD), incluido. Hasta 12 meses después de from.',
  })
  @Matches(REPORT_DATE_PATTERN, { message: REPORT_DATE_FORMAT_MESSAGE })
  to!: string;
}

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
