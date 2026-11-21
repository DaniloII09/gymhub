import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import {
  REPORT_DATE_FORMAT_MESSAGE,
  REPORT_DATE_PATTERN,
} from '@Reports/services';

/** Query ?from=&to= de los reportes del administrador (H28 y H29). */
export class ReportRangeQueryDto {
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
