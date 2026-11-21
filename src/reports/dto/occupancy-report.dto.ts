import { ApiProperty } from '@nestjs/swagger';
import { ReportRangeQueryDto } from './report-range-query.dto.js';

/** Query de GET /reports/occupancy (BE-28.1). */
export class OccupancyReportQueryDto extends ReportRangeQueryDto {}

/** Ocupación de las clases con un mismo nombre en el rango. */
export class ClassOccupancyDto {
  @ApiProperty({ example: 'Spinning Matutino' })
  name!: string;

  @ApiProperty({
    example: 4,
    description: 'Clases con ese nombre que cuentan para el reporte.',
  })
  sessions!: number;

  @ApiProperty({ example: 80, description: 'Suma del cupo máximo.' })
  capacity!: number;

  @ApiProperty({ example: 62, description: 'Suma de reservas confirmadas.' })
  confirmedReservations!: number;

  @ApiProperty({
    example: 77.5,
    description: 'Reservas confirmadas / cupo × 100, con un decimal.',
  })
  occupancyPercent!: number;

  @ApiProperty({
    enum: ['HIGH', 'LOW'],
    nullable: true,
    example: 'HIGH',
    description:
      'HIGH: de mayor ocupación; LOW: de menor; null: sin resaltar (solo con 6 clases o más).',
  })
  level!: 'HIGH' | 'LOW' | null;
}

export class OccupancyTotalsDto {
  @ApiProperty({ example: 7, description: 'Clases distintas (por nombre).' })
  classCount!: number;

  @ApiProperty({ example: 9 })
  sessions!: number;

  @ApiProperty({ example: 39 })
  capacity!: number;

  @ApiProperty({ example: 20 })
  confirmedReservations!: number;

  @ApiProperty({
    example: 51.3,
    description: 'Ocupación de todas las clases juntas, con un decimal.',
  })
  occupancyPercent!: number;
}

/** Respuesta de GET /reports/occupancy. */
export class OccupancyReportDto {
  @ApiProperty({ example: '2026-09-01' })
  from!: string;

  @ApiProperty({ example: '2026-11-30' })
  to!: string;

  @ApiProperty({ type: OccupancyTotalsDto })
  totals!: OccupancyTotalsDto;

  @ApiProperty({
    type: [ClassOccupancyDto],
    description:
      'De mayor a menor ocupación; con el mismo porcentaje, por nombre en orden alfabético.',
  })
  classes!: ClassOccupancyDto[];
}
