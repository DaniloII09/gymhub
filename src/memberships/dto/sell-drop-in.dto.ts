import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsUUID, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CardDto } from '@Payments/dto';

export const MISSING_DROP_IN_CARD_MESSAGE = 'Faltan los datos de la tarjeta.';

/** Cuerpo de POST /memberships/drop-in (BE-4.2). */
export class SellDropInDto {
  @ApiProperty({ format: 'uuid', description: 'Usuario con rol Miembro.' })
  @IsUUID('all', { message: 'El miembro no es válido.' })
  memberId!: string;

  @ApiProperty({ example: 4, description: 'Clase programada de hoy que todavía no inicia.' })
  @IsInt({ message: 'La clase no es válida.' })
  @Min(1, { message: 'La clase no es válida.' })
  classId!: number;

  @ApiProperty({ enum: ['CASH', 'CARD'] })
  @IsIn(['CASH', 'CARD'], { message: 'El método de pago debe ser CASH o CARD.' })
  paymentMethod!: 'CASH' | 'CARD';

  @ApiPropertyOptional({
    type: CardDto,
    description: 'Obligatoria con CARD. Pasa por la pasarela simulada y nunca se guarda.',
  })
  @ValidateIf((dto: SellDropInDto) => dto.paymentMethod === 'CARD' || dto.card !== undefined)
  @ValidateNested({ message: MISSING_DROP_IN_CARD_MESSAGE })
  @Type(() => CardDto)
  card?: CardDto;

  @ApiProperty({
    format: 'uuid',
    description: 'La genera el cliente por intento: la misma clave nunca cobra dos veces.',
  })
  @IsUUID('all', { message: 'La clave de idempotencia debe ser un uuid.' })
  idempotencyKey!: string;
}

/** Respuesta 201 de POST /memberships/drop-in. */
export class DropInSoldDto {
  @ApiProperty({ example: 15 })
  membershipId!: number;

  @ApiProperty({ example: 87 })
  reservationId!: number;

  @ApiProperty({ example: 'C-000012' })
  receiptNumber!: string;

  @ApiProperty({ example: 5, description: 'Precio del plan de clase suelta activo.' })
  amount!: number;

  @ApiProperty({ example: '2026-11-19', description: 'AAAA-MM-DD: vence al terminar el día.' })
  endDate!: string;

  @ApiProperty({ example: 'Spinning Matutino' })
  className!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  classStartsAt!: Date;
}
