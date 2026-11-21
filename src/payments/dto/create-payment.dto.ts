import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@PrismaClient';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Datos de la tarjeta (reglas de la pasarela simulada). Nunca se guardan: el
 * número y el CVV solo pasan por la pasarela, y del número se guardan los
 * últimos 4 dígitos.
 */
export class CardDto {
  @ApiProperty({ example: '4242424242424242', description: '16 dígitos' })
  // Se aceptan espacios entre los grupos de dígitos.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{16}$/, {
    message: 'El número de tarjeta debe tener 16 dígitos.',
  })
  cardNumber!: string;

  @ApiProperty({ example: 'Ana Pérez', minLength: 3, maxLength: 60 })
  @Transform(trim)
  @IsString()
  @Length(3, 60, {
    message: 'El nombre del titular debe tener entre 3 y 60 caracteres.',
  })
  holderName!: string;

  @ApiProperty({ example: '12/28', description: 'MM/AA' })
  @Transform(trim)
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, {
    message: 'El vencimiento debe tener el formato MM/AA.',
  })
  expiry!: string;

  @ApiProperty({ example: '123', description: '3 dígitos' })
  @IsString()
  @Matches(/^\d{3}$/, { message: 'El CVV debe tener 3 dígitos.' })
  cvv!: string;
}

/** Cuerpo de POST /payments (BE-15.2). El monto NO viene aquí: sale del cobro. */
export class CreatePaymentDto {
  @ApiProperty({ example: 1, description: 'Cobro en estado PENDING' })
  @Type(() => Number)
  @IsInt({ message: 'El cobro no es válido.' })
  @Min(1, { message: 'El cobro no es válido.' })
  chargeId!: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod, { message: 'El método de pago debe ser CASH o CARD.' })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    type: CardDto,
    description: 'Obligatorio cuando paymentMethod es CARD',
  })
  @ValidateIf(
    (dto: CreatePaymentDto) => dto.paymentMethod === PaymentMethod.CARD,
  )
  @ValidateNested()
  @Type(() => CardDto)
  card?: CardDto;

  @ApiProperty({
    format: 'uuid',
    description: 'Generada por el frontend en cada clic de "Cobrar"',
  })
  @IsUUID('all', { message: 'La clave de idempotencia debe ser un uuid.' })
  idempotencyKey!: string;
}
