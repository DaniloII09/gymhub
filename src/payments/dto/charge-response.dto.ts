import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ChargeStatus, ChargeType, type Charge } from '@PrismaClient';

/** Query de GET /members/{memberId}/charges. */
export class ListChargesQueryDto {
  @ApiPropertyOptional({ enum: ChargeStatus })
  @IsOptional()
  @IsEnum(ChargeStatus, { message: 'El estado debe ser PENDING o PAID.' })
  status?: ChargeStatus;
}

/** Un cobro del miembro. */
export class ChargeResponseDto {
  @ApiProperty({ example: 1 })
  chargeId!: number;

  @ApiProperty({ enum: ChargeType })
  type!: ChargeType;

  @ApiProperty({ example: 'Membresía Mensual' })
  concept!: string;

  @ApiProperty({ example: 25 })
  amount!: number;

  @ApiProperty({
    example: '2026-11-30',
    description: 'Fecha sin hora (YYYY-MM-DD)',
  })
  dueDate!: string;

  @ApiProperty({ enum: ChargeStatus })
  status!: ChargeStatus;

  static fromEntity(charge: Charge): ChargeResponseDto {
    return {
      chargeId: charge.id,
      type: charge.type,
      concept: charge.concept,
      amount: Number(charge.amount),
      // La columna es DATE: se envía sin hora para que no cambie de día por la zona horaria.
      dueDate: charge.dueDate.toISOString().slice(0, 10),
      status: charge.status,
    };
  }
}

/** Respuesta de GET /members/{memberId}/charges. */
export class ChargeListDto {
  @ApiProperty({ type: [ChargeResponseDto] })
  data!: ChargeResponseDto[];
}
