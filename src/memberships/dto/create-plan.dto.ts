import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { PlanType } from '@PrismaClient';
import {
  IsDurationForType,
  PLAN_BENEFITS_MAX,
  PLAN_BENEFITS_MESSAGE,
  PLAN_DURATION_MAX,
  PLAN_DURATION_MIN,
  PLAN_NAME_MAX,
  PLAN_NAME_MESSAGE,
  PLAN_NAME_MIN,
  PLAN_PRICE_MAX,
  PLAN_PRICE_MESSAGE,
  Trim,
} from './plan-rules.js';

/** Cuerpo de POST /plans (BE-3.1). */
export class CreatePlanDto {
  @ApiProperty({ example: 'Mensual', minLength: PLAN_NAME_MIN, maxLength: PLAN_NAME_MAX })
  @Trim()
  @IsString({ message: PLAN_NAME_MESSAGE })
  @Length(PLAN_NAME_MIN, PLAN_NAME_MAX, { message: PLAN_NAME_MESSAGE })
  name!: string;

  @ApiProperty({ enum: PlanType, example: PlanType.MONTHLY })
  @IsEnum(PlanType, { message: 'El tipo debe ser MONTHLY, QUARTERLY o DROP_IN.' })
  type!: PlanType;

  @ApiPropertyOptional({
    description: 'Obligatoria salvo en DROP_IN, que no la acepta.',
    minimum: PLAN_DURATION_MIN,
    maximum: PLAN_DURATION_MAX,
    example: 30,
  })
  @IsDurationForType()
  durationDays?: number | null;

  @ApiProperty({ example: 25, description: 'Mayor que 0, con 2 decimales como máximo.' })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: PLAN_PRICE_MESSAGE })
  @Min(0.01, { message: PLAN_PRICE_MESSAGE })
  @Max(PLAN_PRICE_MAX, { message: PLAN_PRICE_MESSAGE })
  price!: number;

  @ApiPropertyOptional({ maxLength: PLAN_BENEFITS_MAX })
  @Trim()
  @IsOptional()
  @IsString({ message: PLAN_BENEFITS_MESSAGE })
  @MaxLength(PLAN_BENEFITS_MAX, { message: PLAN_BENEFITS_MESSAGE })
  benefits?: string | null;
}
