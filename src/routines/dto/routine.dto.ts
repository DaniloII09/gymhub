import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const ROUTINE_NAME_MIN = 3;
export const ROUTINE_NAME_MAX = 60;
export const ROUTINE_DAYS_MIN = 1;
export const ROUTINE_DAYS_MAX = 7;
export const ROUTINE_EXERCISES_MIN = 1;
export const ROUTINE_EXERCISES_MAX = 15;
export const EXERCISE_SETS_MIN = 1;
export const EXERCISE_SETS_MAX = 10;
export const EXERCISE_REPS_MIN = 1;
export const EXERCISE_REPS_MAX = 50;
export const EXERCISE_WEIGHT_MIN = 0;
export const EXERCISE_WEIGHT_MAX = 300;

export const ROUTINE_NAME_MESSAGE = `El nombre de la rutina debe tener entre ${ROUTINE_NAME_MIN} y ${ROUTINE_NAME_MAX} caracteres.`;
export const ROUTINE_DAYS_MESSAGE = 'Debes seleccionar entre 1 y 7 días válidos (1=Lunes a 7=Domingo) sin repetir.';
export const ROUTINE_EXERCISES_MESSAGE = `La rutina debe incluir entre ${ROUTINE_EXERCISES_MIN} y ${ROUTINE_EXERCISES_MAX} ejercicios.`;
export const EXERCISE_NAME_MESSAGE = 'El nombre del ejercicio debe tener entre 1 y 80 caracteres.';
export const EXERCISE_SETS_MESSAGE = `Las series deben ser un entero entre ${EXERCISE_SETS_MIN} y ${EXERCISE_SETS_MAX}.`;
export const EXERCISE_REPS_MESSAGE = `Las repeticiones deben ser un entero entre ${EXERCISE_REPS_MIN} y ${EXERCISE_REPS_MAX}.`;
export const EXERCISE_WEIGHT_MESSAGE = `El peso sugerido debe estar entre ${EXERCISE_WEIGHT_MIN} y ${EXERCISE_WEIGHT_MAX} kg.`;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RoutineExerciseInputDto {
  @ApiProperty({ example: 'Sentadilla con barra', minLength: 1, maxLength: 80 })
  @Transform(trimString)
  @IsString({ message: EXERCISE_NAME_MESSAGE })
  @Length(1, 80, { message: EXERCISE_NAME_MESSAGE })
  name!: string;

  @ApiProperty({ minimum: EXERCISE_SETS_MIN, maximum: EXERCISE_SETS_MAX, example: 4 })
  @IsInt({ message: EXERCISE_SETS_MESSAGE })
  @Min(EXERCISE_SETS_MIN, { message: EXERCISE_SETS_MESSAGE })
  @Max(EXERCISE_SETS_MAX, { message: EXERCISE_SETS_MESSAGE })
  sets!: number;

  @ApiProperty({ minimum: EXERCISE_REPS_MIN, maximum: EXERCISE_REPS_MAX, example: 10 })
  @IsInt({ message: EXERCISE_REPS_MESSAGE })
  @Min(EXERCISE_REPS_MIN, { message: EXERCISE_REPS_MESSAGE })
  @Max(EXERCISE_REPS_MAX, { message: EXERCISE_REPS_MESSAGE })
  reps!: number;

  @ApiProperty({ minimum: EXERCISE_WEIGHT_MIN, maximum: EXERCISE_WEIGHT_MAX, example: 60 })
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: EXERCISE_WEIGHT_MESSAGE },
  )
  @Min(EXERCISE_WEIGHT_MIN, { message: EXERCISE_WEIGHT_MESSAGE })
  @Max(EXERCISE_WEIGHT_MAX, { message: EXERCISE_WEIGHT_MESSAGE })
  suggestedWeightKg!: number;
}

export class CreateRoutineDto {
  @ApiProperty({ minLength: ROUTINE_NAME_MIN, maxLength: ROUTINE_NAME_MAX, example: 'Hipertrofia Tren Inferior' })
  @Transform(trimString)
  @IsString({ message: ROUTINE_NAME_MESSAGE })
  @Length(ROUTINE_NAME_MIN, ROUTINE_NAME_MAX, { message: ROUTINE_NAME_MESSAGE })
  name!: string;

  @ApiProperty({ format: 'uuid', description: 'Miembro al que se asigna la rutina.' })
  @IsUUID('all', { message: 'El miembro no es válido.' })
  memberId!: string;

  @ApiProperty({
    type: [Number],
    example: [1, 3, 5],
    description: 'Días de la semana (1=Lunes a 7=Domingo), entre 1 y 7 sin repetir.',
  })
  @IsArray({ message: ROUTINE_DAYS_MESSAGE })
  @ArrayMinSize(ROUTINE_DAYS_MIN, { message: ROUTINE_DAYS_MESSAGE })
  @ArrayMaxSize(ROUTINE_DAYS_MAX, { message: ROUTINE_DAYS_MESSAGE })
  @ArrayUnique({ message: ROUTINE_DAYS_MESSAGE })
  @IsInt({ each: true, message: ROUTINE_DAYS_MESSAGE })
  @Min(1, { each: true, message: ROUTINE_DAYS_MESSAGE })
  @Max(7, { each: true, message: ROUTINE_DAYS_MESSAGE })
  daysOfWeek!: number[];

  @ApiProperty({ type: [RoutineExerciseInputDto] })
  @IsArray({ message: ROUTINE_EXERCISES_MESSAGE })
  @ArrayMinSize(ROUTINE_EXERCISES_MIN, { message: ROUTINE_EXERCISES_MESSAGE })
  @ArrayMaxSize(ROUTINE_EXERCISES_MAX, { message: ROUTINE_EXERCISES_MESSAGE })
  @ValidateNested({ each: true })
  @Type(() => RoutineExerciseInputDto)
  exercises!: RoutineExerciseInputDto[];
}

export class UpdateRoutineDto {
  @ApiPropertyOptional({ minLength: ROUTINE_NAME_MIN, maxLength: ROUTINE_NAME_MAX })
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: ROUTINE_NAME_MESSAGE })
  @Length(ROUTINE_NAME_MIN, ROUTINE_NAME_MAX, { message: ROUTINE_NAME_MESSAGE })
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'El miembro no es válido.' })
  memberId?: string;

  @ApiPropertyOptional({ type: [Number], example: [1, 4] })
  @IsOptional()
  @IsArray({ message: ROUTINE_DAYS_MESSAGE })
  @ArrayMinSize(ROUTINE_DAYS_MIN, { message: ROUTINE_DAYS_MESSAGE })
  @ArrayMaxSize(ROUTINE_DAYS_MAX, { message: ROUTINE_DAYS_MESSAGE })
  @ArrayUnique({ message: ROUTINE_DAYS_MESSAGE })
  @IsInt({ each: true, message: ROUTINE_DAYS_MESSAGE })
  @Min(1, { each: true, message: ROUTINE_DAYS_MESSAGE })
  @Max(7, { each: true, message: ROUTINE_DAYS_MESSAGE })
  daysOfWeek?: number[];

  @ApiPropertyOptional({ type: [RoutineExerciseInputDto] })
  @IsOptional()
  @IsArray({ message: ROUTINE_EXERCISES_MESSAGE })
  @ArrayMinSize(ROUTINE_EXERCISES_MIN, { message: ROUTINE_EXERCISES_MESSAGE })
  @ArrayMaxSize(ROUTINE_EXERCISES_MAX, { message: ROUTINE_EXERCISES_MESSAGE })
  @ValidateNested({ each: true })
  @Type(() => RoutineExerciseInputDto)
  exercises?: RoutineExerciseInputDto[];
}

export class RoutineExerciseResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  sortOrder!: number;

  @ApiProperty({ example: 'Sentadilla con barra' })
  name!: string;

  @ApiProperty({ example: 4 })
  sets!: number;

  @ApiProperty({ example: 10 })
  reps!: number;

  @ApiProperty({ example: 60 })
  suggestedWeightKg!: number;
}

export class RoutineTrainerSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Entrenador Demo' })
  fullName!: string;
}

export class RoutineMemberSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Juan Perez' })
  fullName!: string;

  @ApiProperty({ type: String, nullable: true, example: 'GYM-000001' })
  memberCode!: string | null;
}

export class RoutineResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Hipertrofia Tren Inferior' })
  name!: string;

  @ApiProperty({ type: [Number], example: [1, 3, 5] })
  daysOfWeek!: number[];

  @ApiProperty({ type: RoutineTrainerSummaryDto })
  trainer!: RoutineTrainerSummaryDto;

  @ApiProperty({ type: RoutineMemberSummaryDto })
  member!: RoutineMemberSummaryDto;

  @ApiProperty({ type: [RoutineExerciseResponseDto] })
  exercises!: RoutineExerciseResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class RoutineListDto {
  @ApiProperty({ type: [RoutineResponseDto] })
  data!: RoutineResponseDto[];
}
