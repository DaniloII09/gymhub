import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@PrismaClient';
import type { ApprovedPayment } from '@Payments/repositories';

/** Respuesta 201 de POST /payments: los datos del comprobante emitido. */
export class PaymentResponseDto {
  @ApiProperty({ example: 10 })
  paymentId!: number;

  @ApiProperty({ example: 1 })
  chargeId!: number;

  @ApiProperty({ example: 'Membresía Mensual' })
  concept!: string;

  @ApiProperty({ example: 25 })
  amount!: number;

  @ApiProperty({ example: 'C-000002' })
  receiptNumber!: string;

  @ApiProperty({ example: 2, description: 'Para descargar el PDF' })
  receiptId!: number;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ type: String, nullable: true, example: '4242' })
  cardLast4!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  issuedAt!: Date;

  static fromEntity(payment: ApprovedPayment): PaymentResponseDto {
    return {
      paymentId: payment.paymentId,
      chargeId: payment.chargeId,
      concept: payment.concept,
      amount: payment.amount,
      receiptNumber: payment.receiptNumber,
      receiptId: payment.receiptId,
      paymentMethod: payment.method,
      cardLast4: payment.cardLast4,
      issuedAt: payment.issuedAt,
    };
  }
}
