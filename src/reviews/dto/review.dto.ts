import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const REVIEW_TARGET_TYPES = ['CLASS', 'PERSONAL_SESSION'] as const;
export type ReviewTargetType = (typeof REVIEW_TARGET_TYPES)[number];

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
export const REVIEW_COMMENT_MAX = 500;
const MAX_INT_ID = 2_147_483_647;

export const REVIEW_TARGET_TYPE_MESSAGE = 'El tipo debe ser CLASS o PERSONAL_SESSION.';
export const REVIEW_TARGET_ID_MESSAGE = 'El identificador del objetivo no es válido.';
export const REVIEW_RATING_MESSAGE = 'La calificación debe ser un entero entre 1 y 5.';
export const REVIEW_COMMENT_MAX_MESSAGE = 'El comentario no puede superar los 500 caracteres.';

/** Cuerpo de POST /api/v1/reviews (BE-22.2). */
export class CreateReviewDto {
  @ApiProperty({ enum: REVIEW_TARGET_TYPES, example: 'CLASS' })
  @IsIn(REVIEW_TARGET_TYPES, { message: REVIEW_TARGET_TYPE_MESSAGE })
  targetType!: ReviewTargetType;

  @ApiProperty({ example: 12 })
  @IsInt({ message: REVIEW_TARGET_ID_MESSAGE })
  @Min(1, { message: REVIEW_TARGET_ID_MESSAGE })
  @Max(MAX_INT_ID, { message: REVIEW_TARGET_ID_MESSAGE })
  targetId!: number;

  @ApiProperty({ minimum: REVIEW_RATING_MIN, maximum: REVIEW_RATING_MAX, example: 5 })
  @IsInt({ message: REVIEW_RATING_MESSAGE })
  @Min(REVIEW_RATING_MIN, { message: REVIEW_RATING_MESSAGE })
  @Max(REVIEW_RATING_MAX, { message: REVIEW_RATING_MESSAGE })
  rating!: number;

  @ApiPropertyOptional({
    maxLength: REVIEW_COMMENT_MAX,
    example: 'Excelente clase, muy buena explicación del entrenador.',
    description: 'Opcional; vacío o solo espacios se guarda como null.',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsOptional()
  @IsString({ message: 'El comentario debe ser una cadena de texto.' })
  @MaxLength(REVIEW_COMMENT_MAX, { message: REVIEW_COMMENT_MAX_MESSAGE })
  comment?: string;
}

/** Elemento pendiente por calificar en GET /api/v1/reviews/pending (BE-22.1). */
export class PendingReviewItemDto {
  @ApiProperty({ enum: REVIEW_TARGET_TYPES, example: 'CLASS' })
  targetType!: ReviewTargetType;

  @ApiProperty({ example: 12 })
  targetId!: number;

  @ApiProperty({ example: 'Yoga Flow' })
  title!: string;

  @ApiProperty({ format: 'uuid' })
  trainerId!: string;

  @ApiProperty({ example: 'Entrenador Demo' })
  trainerName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startsAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  endsAt!: Date;

  @ApiProperty({
    example: '2026-11-25',
    description: 'Último día en la zona del gimnasio (AAAA-MM-DD) para calificar.',
  })
  reviewDeadline!: string;
}

export class PendingReviewListDto {
  @ApiProperty({ type: [PendingReviewItemDto] })
  data!: PendingReviewItemDto[];
}

/** Reseña guardada (respuesta de POST /reviews y GET /reviews/me). */
export class ReviewResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ enum: REVIEW_TARGET_TYPES, example: 'CLASS' })
  targetType!: ReviewTargetType;

  @ApiProperty({ example: 12 })
  targetId!: number;

  @ApiProperty({ example: 'Yoga Flow' })
  title!: string;

  @ApiProperty({ format: 'uuid' })
  trainerId!: string;

  @ApiProperty({ example: 'Entrenador Demo' })
  trainerName!: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  rating!: number;

  @ApiProperty({ type: String, nullable: true, example: 'Excelente clase.' })
  comment!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class ReviewListDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  data!: ReviewResponseDto[];
}
