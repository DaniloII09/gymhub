import { ApiProperty } from '@nestjs/swagger';
import { ReportRangeQueryDto } from './report-range-query.dto.js';

/** Query de GET /api/v1/reports/ratings (BE-23.1). */
export class RatingsReportQueryDto extends ReportRangeQueryDto {}

export class TrainerRatingSummaryDto {
  @ApiProperty({ format: 'uuid' })
  trainerId!: string;

  @ApiProperty({ example: 'Entrenador Demo' })
  trainerName!: string;

  @ApiProperty({ example: 4.3, description: 'Promedio con un decimal (1.0 a 5.0).' })
  averageRating!: number;

  @ApiProperty({ example: 3, description: 'Cantidad de reseñas (clases + sesiones).' })
  reviewCount!: number;
}

export class ClassRatingSummaryDto {
  @ApiProperty({ example: 'Yoga Flow' })
  className!: string;

  @ApiProperty({ example: 4.5, description: 'Promedio con un decimal (1.0 a 5.0).' })
  averageRating!: number;

  @ApiProperty({ example: 4, description: 'Cantidad de reseñas de clases con ese nombre.' })
  reviewCount!: number;
}

/** Respuesta de GET /api/v1/reports/ratings (BE-23.1). */
export class RatingsReportDto {
  @ApiProperty({ example: '2026-09-01' })
  from!: string;

  @ApiProperty({ example: '2026-11-30' })
  to!: string;

  @ApiProperty({
    type: [TrainerRatingSummaryDto],
    description: 'Incluye reseñas de clases y sesiones personales; orden ascendente por promedio y nombre.',
  })
  byTrainer!: TrainerRatingSummaryDto[];

  @ApiProperty({
    type: [ClassRatingSummaryDto],
    description: 'Reseñas de clases agrupadas por nombre; orden ascendente por promedio y nombre.',
  })
  byClassName!: ClassRatingSummaryDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: '"No hay reseñas en ese rango." cuando no hubo reseñas; si no, null.',
  })
  message!: string | null;
}
