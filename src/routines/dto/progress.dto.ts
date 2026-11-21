import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const PROGRESS_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const PROGRESS_DATE_FORMAT_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD.';
export const PROGRESS_WEIGHT_MIN = 20;
export const PROGRESS_WEIGHT_MAX = 300;
export const PROGRESS_MEASURE_MIN = 10;
export const PROGRESS_MEASURE_MAX = 250;

export const PROGRESS_WEIGHT_MESSAGE = `El peso debe estar entre ${PROGRESS_WEIGHT_MIN} y ${PROGRESS_WEIGHT_MAX} kg.`;
export const PROGRESS_CHEST_MESSAGE = `La medida de pecho debe estar entre ${PROGRESS_MEASURE_MIN} y ${PROGRESS_MEASURE_MAX} cm.`;
export const PROGRESS_WAIST_MESSAGE = `La medida de cintura debe estar entre ${PROGRESS_MEASURE_MIN} y ${PROGRESS_MEASURE_MAX} cm.`;
export const PROGRESS_ARM_MESSAGE = `La medida de brazo debe estar entre ${PROGRESS_MEASURE_MIN} y ${PROGRESS_MEASURE_MAX} cm.`;

export class CreateProgressEntryDto {
  @ApiProperty({ example: '2026-11-20', description: 'Fecha (AAAA-MM-DD), no futura.' })
  @Matches(PROGRESS_DATE_PATTERN, { message: PROGRESS_DATE_FORMAT_MESSAGE })
  date!: string;

  @ApiProperty({ minimum: PROGRESS_WEIGHT_MIN, maximum: PROGRESS_WEIGHT_MAX, example: 76.0 })
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: PROGRESS_WEIGHT_MESSAGE },
  )
  @Min(PROGRESS_WEIGHT_MIN, { message: PROGRESS_WEIGHT_MESSAGE })
  @Max(PROGRESS_WEIGHT_MAX, { message: PROGRESS_WEIGHT_MESSAGE })
  weightKg!: number;

  @ApiProperty({ minimum: PROGRESS_MEASURE_MIN, maximum: PROGRESS_MEASURE_MAX, example: 98.5 })
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: PROGRESS_CHEST_MESSAGE },
  )
  @Min(PROGRESS_MEASURE_MIN, { message: PROGRESS_CHEST_MESSAGE })
  @Max(PROGRESS_MEASURE_MAX, { message: PROGRESS_CHEST_MESSAGE })
  chestCm!: number;

  @ApiProperty({ minimum: PROGRESS_MEASURE_MIN, maximum: PROGRESS_MEASURE_MAX, example: 84.0 })
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: PROGRESS_WAIST_MESSAGE },
  )
  @Min(PROGRESS_MEASURE_MIN, { message: PROGRESS_WAIST_MESSAGE })
  @Max(PROGRESS_MEASURE_MAX, { message: PROGRESS_WAIST_MESSAGE })
  waistCm!: number;

  @ApiProperty({ minimum: PROGRESS_MEASURE_MIN, maximum: PROGRESS_MEASURE_MAX, example: 34.5 })
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: PROGRESS_ARM_MESSAGE },
  )
  @Min(PROGRESS_MEASURE_MIN, { message: PROGRESS_ARM_MESSAGE })
  @Max(PROGRESS_MEASURE_MAX, { message: PROGRESS_ARM_MESSAGE })
  armCm!: number;
}

export class UpdateProgressEntryDto {
  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Matches(PROGRESS_DATE_PATTERN, { message: PROGRESS_DATE_FORMAT_MESSAGE })
  date?: string;

  @ApiPropertyOptional({ minimum: PROGRESS_WEIGHT_MIN, maximum: PROGRESS_WEIGHT_MAX })
  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: PROGRESS_WEIGHT_MESSAGE },
  )
  @Min(PROGRESS_WEIGHT_MIN, { message: PROGRESS_WEIGHT_MESSAGE })
  @Max(PROGRESS_WEIGHT_MAX, { message: PROGRESS_WEIGHT_MESSAGE })
  weightKg?: number;

  @ApiPropertyOptional({ minimum: PROGRESS_MEASURE_MIN, maximum: PROGRESS_MEASURE_MAX })
  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: PROGRESS_CHEST_MESSAGE },
  )
  @Min(PROGRESS_MEASURE_MIN, { message: PROGRESS_CHEST_MESSAGE })
  @Max(PROGRESS_MEASURE_MAX, { message: PROGRESS_CHEST_MESSAGE })
  chestCm?: number;

  @ApiPropertyOptional({ minimum: PROGRESS_MEASURE_MIN, maximum: PROGRESS_MEASURE_MAX })
  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: PROGRESS_WAIST_MESSAGE },
  )
  @Min(PROGRESS_MEASURE_MIN, { message: PROGRESS_WAIST_MESSAGE })
  @Max(PROGRESS_MEASURE_MAX, { message: PROGRESS_WAIST_MESSAGE })
  waistCm?: number;

  @ApiPropertyOptional({ minimum: PROGRESS_MEASURE_MIN, maximum: PROGRESS_MEASURE_MAX })
  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: PROGRESS_ARM_MESSAGE },
  )
  @Min(PROGRESS_MEASURE_MIN, { message: PROGRESS_ARM_MESSAGE })
  @Max(PROGRESS_MEASURE_MAX, { message: PROGRESS_ARM_MESSAGE })
  armCm?: number;
}

export class ProgressEntryResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '2026-10-01' })
  date!: string;

  @ApiProperty({ example: 76.0 })
  weightKg!: number;

  @ApiProperty({ example: 98.5 })
  chestCm!: number;

  @ApiProperty({ example: 84.0 })
  waistCm!: number;

  @ApiProperty({ example: 34.5 })
  armCm!: number;

  @ApiProperty({
    example: true,
    description: 'true en el primer registro cronológico (línea base).',
  })
  isBaseline!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ProgressDeltasDto {
  @ApiProperty({ example: -3.5 })
  weightKg!: number;

  @ApiProperty({ example: 1.5 })
  chestCm!: number;

  @ApiProperty({ example: -3.0 })
  waistCm!: number;

  @ApiProperty({ example: 0.5 })
  armCm!: number;
}

export class ProgressEvolutionResponseDto {
  @ApiProperty({
    type: [ProgressEntryResponseDto],
    description: 'Registros ordenados cronológicamente (ascendente por fecha).',
  })
  entries!: ProgressEntryResponseDto[];

  @ApiProperty({
    type: ProgressDeltasDto,
    nullable: true,
    description:
      'Diferencias del último registro respecto al primero (0 con un solo registro; null sin registros).',
  })
  deltas!: ProgressDeltasDto | null;
}
