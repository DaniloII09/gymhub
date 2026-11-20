import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import {
  REPORT_DATE_FORMAT_MESSAGE,
  REPORT_DATE_PATTERN,
} from '@Reports/services';

/** Query de GET /reports/income (BE-29.1). */
export class IncomeReportQueryDto {
  @ApiProperty({
    example: '2026-09-01',
    description: 'Primer día del rango (YYYY-MM-DD), incluido.',
  })
  // El formato se valida aquí; que la fecha exista, el orden y los 12 meses
  // los revisa el servicio.
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
