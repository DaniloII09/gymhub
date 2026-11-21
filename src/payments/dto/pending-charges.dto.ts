import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@Common/pagination';
import {
  PENDING_CHARGE_TYPES,
  type PendingChargeRow,
  type PendingChargeType,
} from '@Payments/repositories';
import type { PendingChargesResult } from '@Payments/services';

/** Query de GET /charges/pending (BE-17.1): 20 por página por defecto. */
export class PendingChargesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PENDING_CHARGE_TYPES,
    description: 'Sin el filtro se listan todos los tipos.',
  })
  @IsOptional()
  @IsIn(PENDING_CHARGE_TYPES, {
    message: 'El tipo debe ser MEMBERSHIP o PERSONAL_SESSION.',
  })
  type?: PendingChargeType;
}

/** Un cobro pendiente con sus días de atraso. */
export class PendingChargeDto {
  @ApiProperty({ example: 4 })
  chargeId!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'GYM-000002',
    description: 'null si el miembro no tiene código (H01)',
  })
  memberCode!: string | null;

  @ApiProperty({ example: 'Ana Gomez' })
  fullName!: string;

  @ApiProperty({ example: 'Sesión personal' })
  concept!: string;

  @ApiProperty({ example: 15 })
  amount!: number;

  @ApiProperty({
    example: '2026-11-06',
    description: 'Fecha sin hora (YYYY-MM-DD)',
  })
  dueDate!: string;

  @ApiProperty({
    example: 6,
    description: 'Días entre el vencimiento y hoy; 0 si todavía no vence.',
  })
  daysLate!: number;

  static fromEntity(row: PendingChargeRow): PendingChargeDto {
    return {
      chargeId: row.id,
      memberCode: row.memberCode,
      fullName: row.fullName,
      concept: row.concept,
      amount: row.amount,
      // La columna es DATE: se envía sin hora para que no cambie de día por la zona horaria.
      dueDate: row.dueDate.toISOString().slice(0, 10),
      daysLate: row.daysLate,
    };
  }
}

/** Respuesta de GET /charges/pending. */
export class PendingChargeListDto {
  @ApiProperty({ type: [PendingChargeDto] })
  data!: PendingChargeDto[];

  @ApiProperty({
    example: 40,
    description:
      'Suma de todos los cobros que cumplen el filtro, no solo de esta página.',
  })
  totalOwed!: number;

  @ApiProperty({ example: 2, description: 'Cobros que cumplen el filtro.' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  static fromResult(result: PendingChargesResult): PendingChargeListDto {
    return {
      data: result.data.map((row) => PendingChargeDto.fromEntity(row)),
      totalOwed: result.totalOwed,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }
}
