import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateBy,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export const CLASS_NAME_MIN_LENGTH = 3;
export const CLASS_NAME_MAX_LENGTH = 60;
export const CLASS_CAPACITY_MIN = 1;
export const CLASS_CAPACITY_MAX = 50;
export const CLASS_DURATION_MIN_MINUTES = 30;
export const CLASS_DURATION_MAX_MINUTES = 180;

export const MISSING_CLASS_NAME_MESSAGE =
  'El nombre de la clase es obligatorio.';
export const CLASS_NAME_LENGTH_MESSAGE = `El nombre debe tener entre ${CLASS_NAME_MIN_LENGTH} y ${CLASS_NAME_MAX_LENGTH} caracteres.`;
export const INVALID_TRAINER_UUID_MESSAGE =
  'El identificador del entrenador debe ser un UUID válido.';
export const INVALID_STARTS_AT_MESSAGE =
  'La fecha y hora de inicio no son válidas.';
export const PAST_STARTS_AT_MESSAGE =
  'La fecha y hora de inicio no pueden estar en el pasado.';
export const INVALID_ENDS_AT_MESSAGE = 'La fecha y hora de fin no son válidas.';
export const ENDS_BEFORE_STARTS_MESSAGE =
  'La hora de fin debe ser posterior a la hora de inicio.';
export const CLASS_DURATION_RANGE_MESSAGE = `La duración de la clase debe ser de entre ${CLASS_DURATION_MIN_MINUTES} y ${CLASS_DURATION_MAX_MINUTES} minutos.`;
export const CLASS_CAPACITY_RANGE_MESSAGE = `El cupo máximo debe ser un número entero entre ${CLASS_CAPACITY_MIN} y ${CLASS_CAPACITY_MAX}.`;

function isValidDateInstance(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Valida el nombre de la clase con un único mensaje claro: si falta o queda
 * vacío tras recortar espacios, o si queda fuera del rango de 3 a 60 caracteres.
 */
export function IsClassName(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isClassName',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          value.length >= CLASS_NAME_MIN_LENGTH &&
          value.length <= CLASS_NAME_MAX_LENGTH,
        defaultMessage: (args?: ValidationArguments) =>
          typeof args?.value === 'string' && args.value.length > 0
            ? CLASS_NAME_LENGTH_MESSAGE
            : MISSING_CLASS_NAME_MESSAGE,
      },
    },
    options,
  );
}

/**
 * Comprueba que la fecha y hora de inicio sean futuras respecto al momento actual.
 */
export function IsFutureStartDate(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isFutureStartDate',
      validator: {
        validate: (value: unknown) => {
          if (!isValidDateInstance(value)) return true;
          return value.getTime() > Date.now();
        },
        defaultMessage: () => PAST_STARTS_AT_MESSAGE,
      },
    },
    options,
  );
}

/**
 * Comprueba que `endsAt` sea posterior a `startsAt` y que la duración esté
 * entre 30 y 180 minutos.
 */
export function IsValidClassEndTime(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidClassEndTime',
      validator: {
        validate: (value: unknown, args?: ValidationArguments) => {
          const obj = args?.object as { startsAt?: unknown } | undefined;
          if (!isValidDateInstance(value) || !isValidDateInstance(obj?.startsAt)) {
            return true;
          }
          const diffMs = value.getTime() - obj.startsAt.getTime();
          if (diffMs <= 0) return false;
          const durationMinutes = diffMs / 60_000;
          return (
            durationMinutes >= CLASS_DURATION_MIN_MINUTES &&
            durationMinutes <= CLASS_DURATION_MAX_MINUTES
          );
        },
        defaultMessage: (args?: ValidationArguments) => {
          const obj = args?.object as { startsAt?: unknown } | undefined;
          if (
            isValidDateInstance(args?.value) &&
            isValidDateInstance(obj?.startsAt) &&
            args.value.getTime() <= obj.startsAt.getTime()
          ) {
            return ENDS_BEFORE_STARTS_MESSAGE;
          }
          return CLASS_DURATION_RANGE_MESSAGE;
        },
      },
    },
    options,
  );
}

export class CreateClassDto {
  @ApiProperty({
    description: 'Nombre de la clase grupal (3 a 60 caracteres)',
    example: 'Spinning Matutino',
    minLength: CLASS_NAME_MIN_LENGTH,
    maxLength: CLASS_NAME_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsClassName()
  name!: string;

  @ApiProperty({
    description: 'UUID del usuario con rol TRAINER asignado a la clase',
    example: '11111111-1111-4111-8111-111111111111',
    format: 'uuid',
  })
  @IsUUID('all', { message: INVALID_TRAINER_UUID_MESSAGE })
  trainerId!: string;

  @ApiProperty({
    description: 'Fecha y hora de inicio en formato ISO 8601 (futura)',
    example: '2026-12-01T18:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @Type(() => Date)
  @IsDate({ message: INVALID_STARTS_AT_MESSAGE })
  @IsFutureStartDate()
  startsAt!: Date;

  @ApiProperty({
    description:
      'Fecha y hora de fin en formato ISO 8601 (duración entre 30 y 180 minutos)',
    example: '2026-12-01T18:50:00.000Z',
    type: String,
    format: 'date-time',
  })
  @Type(() => Date)
  @IsDate({ message: INVALID_ENDS_AT_MESSAGE })
  @IsValidClassEndTime()
  endsAt!: Date;

  @ApiProperty({
    description: 'Cupo máximo de asistentes (1 a 50)',
    example: 20,
    minimum: CLASS_CAPACITY_MIN,
    maximum: CLASS_CAPACITY_MAX,
  })
  @IsInt({ message: CLASS_CAPACITY_RANGE_MESSAGE })
  @Min(CLASS_CAPACITY_MIN, { message: CLASS_CAPACITY_RANGE_MESSAGE })
  @Max(CLASS_CAPACITY_MAX, { message: CLASS_CAPACITY_RANGE_MESSAGE })
  capacity!: number;
}
