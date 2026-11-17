import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsObject, IsUUID, ValidateNested } from 'class-validator';
import { PaymentMethod } from '@PrismaClient';
import type { MemberCardPayment } from '@Payments/services';
import { CardDto } from './create-payment.dto.js';

const MISSING_CARD_MESSAGE = 'Faltan los datos de la tarjeta.';

/**
 * Cuerpo de POST /charges/{chargeId}/card-payment (BE-16.2). Igual que en H15,
 * el monto no viene aquí: sale del cobro guardado.
 */
export class CardPaymentDto {
  @ApiProperty({ type: CardDto })
  @IsDefined({ message: MISSING_CARD_MESSAGE })
  @IsObject({ message: MISSING_CARD_MESSAGE })
  @ValidateNested()
  @Type(() => CardDto)
  card!: CardDto;

  @ApiProperty({
    format: 'uuid',
    description: 'Generada por el frontend en cada clic de "Pagar"',
  })
  @IsUUID('all', { message: 'La clave de idempotencia debe ser un uuid.' })
  idempotencyKey!: string;
}

/** Respuesta 201 del pago en línea: el comprobante emitido (H16). */
export class CardPaymentResponseDto {
  @ApiProperty({ example: 1 })
  chargeId!: number;

  @ApiProperty({ enum: ['PAID'], example: 'PAID' })
  status!: 'PAID';

  @ApiProperty({ example: 2, description: 'Para descargar el PDF' })
  receiptId!: number;

  @ApiProperty({ example: 'C-000002' })
  receiptNumber!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'NONE'],
    description:
      'Solo en cobros de membresía (null en otro caso). Lo calcula H04: hasta que exista, es null.',
  })
  membershipStatus!: string | null;

  @ApiProperty({ example: 'Membresía Mensual' })
  concept!: string;

  @ApiProperty({ example: 25 })
  amount!: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CARD })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ type: String, nullable: true, example: '4242' })
  cardLast4!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  issuedAt!: Date;

  static fromEntity(payment: MemberCardPayment): CardPaymentResponseDto {
    return {
      chargeId: payment.chargeId,
      status: 'PAID',
      receiptId: payment.receiptId,
      receiptNumber: payment.receiptNumber,
      membershipStatus: payment.membershipStatus,
      concept: payment.concept,
      amount: payment.amount,
      paymentMethod: payment.method,
      cardLast4: payment.cardLast4,
      issuedAt: payment.issuedAt,
    };
  }
}
