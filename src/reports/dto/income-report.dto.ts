import { ApiProperty } from '@nestjs/swagger';
import { ReportRangeQueryDto } from './report-range-query.dto.js';

/** Query de GET /reports/income (BE-29.1). */
export class IncomeReportQueryDto extends ReportRangeQueryDto {}

/** Ingresos separados por concepto. */
export class IncomeBreakdownDto {
  @ApiProperty({ example: 110, description: 'Membresías.' })
  membership!: number;

  @ApiProperty({ example: 10, description: 'Clases sueltas.' })
  dropIn!: number;

  @ApiProperty({ example: 30, description: 'Sesiones personales.' })
  personalSession!: number;

  @ApiProperty({ example: 150 })
  total!: number;

  @ApiProperty({
    example: 7,
    description: 'Comprobantes que suman este total.',
  })
  receiptCount!: number;
}

export class IncomeMonthDto extends IncomeBreakdownDto {
  @ApiProperty({
    example: '2026-10',
    description: 'Mes (YYYY-MM) en el calendario del gimnasio.',
  })
  month!: string;
}

/** Respuesta de GET /reports/income. */
export class IncomeReportDto {
  @ApiProperty({ example: '2026-09-01' })
  from!: string;

  @ApiProperty({ example: '2026-11-30' })
  to!: string;

  @ApiProperty({
    type: IncomeBreakdownDto,
    description: 'Totales de todo el rango.',
  })
  totals!: IncomeBreakdownDto;

  @ApiProperty({
    type: [IncomeMonthDto],
    description:
      'Todos los meses del rango en orden, con 0 en los que no hubo pagos.',
  })
  months!: IncomeMonthDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      '"No hay pagos en ese rango." cuando no hubo comprobantes; si no, null.',
  })
  message!: string | null;
}
