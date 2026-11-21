import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@PrismaClient';
import type { Paginated } from '@Common/pagination';
import type { ReceiptSummary } from '@Payments/repositories';

/** Un comprobante en "Mis pagos" (BE-16.1). */
export class ReceiptSummaryDto {
  @ApiProperty({ example: 2, description: 'Para descargar el PDF' })
  receiptId!: number;

  @ApiProperty({ example: 'C-000002' })
  number!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  issuedAt!: Date;

  @ApiProperty({ example: 'Membresía Mensual' })
  concept!: string;

  @ApiProperty({ example: 25 })
  amount!: number;

  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;

  @ApiProperty({ type: String, nullable: true, example: '4242' })
  cardLast4!: string | null;

  static fromEntity(receipt: ReceiptSummary): ReceiptSummaryDto {
    return {
      receiptId: receipt.id,
      number: receipt.number,
      issuedAt: receipt.issuedAt,
      concept: receipt.concept,
      amount: receipt.amount,
      method: receipt.method,
      cardLast4: receipt.cardLast4,
    };
  }
}

/** Respuesta de GET /receipts/me: 20 por página, del más reciente al más antiguo. */
export class ReceiptListDto implements Paginated<ReceiptSummaryDto> {
  @ApiProperty({ type: [ReceiptSummaryDto] })
  data!: ReceiptSummaryDto[];

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  static fromPage(page: Paginated<ReceiptSummary>): ReceiptListDto {
    return {
      ...page,
      data: page.data.map((receipt) => ReceiptSummaryDto.fromEntity(receipt)),
    };
  }
}
