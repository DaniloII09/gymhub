import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PLAN_BENEFITS_MAX,
  PLAN_BENEFITS_MESSAGE,
  PLAN_DURATION_MAX,
  PLAN_DURATION_MESSAGE,
  PLAN_DURATION_MIN,
  PLAN_NAME_MAX,
  PLAN_NAME_MESSAGE,
  PLAN_NAME_MIN,
  PLAN_PRICE_MAX,
  PLAN_PRICE_MESSAGE,
  Trim,
} from './plan-rules.js';

/**
 * Cuerpo de PATCH /plans/{planId} (BE-3.1). Todos los campos son opcionales.
 * No incluye `type`: el tipo no se puede cambiar, y como la ValidationPipe
 * rechaza propiedades no declaradas, enviarlo responde 400.
 *
 * Que la duración sea compatible con el tipo guardado lo revisa el servicio,
 * porque el cuerpo no trae el tipo.
 */
export class UpdatePlanDto {
  @ApiPropertyOptional({ minLength: PLAN_NAME_MIN, maxLength: PLAN_NAME_MAX })
  @Trim()
  // null no es "no cambiar": se valida y responde 400.
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: PLAN_NAME_MESSAGE })
  @Length(PLAN_NAME_MIN, PLAN_NAME_MAX, { message: PLAN_NAME_MESSAGE })
  name?: string;

  @ApiPropertyOptional({ minimum: PLAN_DURATION_MIN, maximum: PLAN_DURATION_MAX })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt({ message: PLAN_DURATION_MESSAGE })
  @Min(PLAN_DURATION_MIN, { message: PLAN_DURATION_MESSAGE })
  @Max(PLAN_DURATION_MAX, { message: PLAN_DURATION_MESSAGE })
  durationDays?: number;

  @ApiPropertyOptional({ description: 'Mayor que 0, con 2 decimales como máximo.' })
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: PLAN_PRICE_MESSAGE })
  @Min(0.01, { message: PLAN_PRICE_MESSAGE })
  @Max(PLAN_PRICE_MAX, { message: PLAN_PRICE_MESSAGE })
  price?: number;

  @ApiPropertyOptional({
    maxLength: PLAN_BENEFITS_MAX,
    nullable: true,
    description: 'null o vacío borra los beneficios.',
  })
  @Trim()
  @IsOptional()
  @IsString({ message: PLAN_BENEFITS_MESSAGE })
  @MaxLength(PLAN_BENEFITS_MAX, { message: PLAN_BENEFITS_MESSAGE })
  benefits?: string | null;
}
