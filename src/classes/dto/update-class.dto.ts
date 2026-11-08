import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  CLASS_CAPACITY_MAX,
  CLASS_CAPACITY_MIN,
  CLASS_CAPACITY_RANGE_MESSAGE,
  CLASS_NAME_MAX_LENGTH,
  CLASS_NAME_MIN_LENGTH,
  INVALID_ENDS_AT_MESSAGE,
  INVALID_STARTS_AT_MESSAGE,
  INVALID_TRAINER_UUID_MESSAGE,
  IsClassName,
  IsFutureStartDate,
  IsValidClassEndTime,
} from './create-class.dto.js';

export class UpdateClassDto {
  @ApiPropertyOptional({
    description: 'Nuevo nombre de la clase grupal (3 a 60 caracteres)',
    example: 'Spinning Avanzado',
    minLength: CLASS_NAME_MIN_LENGTH,
    maxLength: CLASS_NAME_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsClassName()
  name?: string;

  @ApiPropertyOptional({
    description: 'UUID del entrenador asignado (debe tener rol TRAINER)',
    example: '11111111-1111-4111-8111-111111111111',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: INVALID_TRAINER_UUID_MESSAGE })
  trainerId?: string;

  @ApiPropertyOptional({
    description: 'Nueva fecha y hora de inicio en formato ISO 8601 (futura)',
    example: '2026-12-01T18:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: INVALID_STARTS_AT_MESSAGE })
  @IsFutureStartDate()
  startsAt?: Date;

  @ApiPropertyOptional({
    description:
      'Nueva fecha y hora de fin en formato ISO 8601 (duración entre 30 y 180 minutos)',
    example: '2026-12-01T19:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: INVALID_ENDS_AT_MESSAGE })
  @IsValidClassEndTime()
  endsAt?: Date;

  @ApiPropertyOptional({
    description:
      'Nuevo cupo máximo (1 a 50, igual o mayor a las reservas confirmadas)',
    example: 25,
    minimum: CLASS_CAPACITY_MIN,
    maximum: CLASS_CAPACITY_MAX,
  })
  @IsOptional()
  @IsInt({ message: CLASS_CAPACITY_RANGE_MESSAGE })
  @Min(CLASS_CAPACITY_MIN, { message: CLASS_CAPACITY_RANGE_MESSAGE })
  @Max(CLASS_CAPACITY_MAX, { message: CLASS_CAPACITY_RANGE_MESSAGE })
  capacity?: number;
}
