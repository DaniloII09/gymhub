import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { PaymentMethod } from '@PrismaClient';

/** Datos guardados que se imprimen en el comprobante. */
export interface ReceiptDetail {
  id: number;
  number: string;
  issuedAt: Date;
  memberId: string;
  /** Correo del miembro: User todavía no tiene nombre (llega con H01). */
  memberEmail: string;
  concept: string;
  amount: number;
  method: PaymentMethod;
  cardLast4: string | null;
}

/** Único punto del módulo que lee la tabla `receipts`. */
@Injectable()
export class ReceiptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDetail(receiptId: number): Promise<ReceiptDetail | null> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        payment: { select: { method: true, cardLast4: true } },
        charge: {
          select: {
            memberId: true,
            concept: true,
            amount: true,
            member: { select: { email: true } },
          },
        },
      },
    });
    if (!receipt) return null;

    return {
      id: receipt.id,
      number: receipt.number,
      issuedAt: receipt.issuedAt,
      memberId: receipt.charge.memberId,
      memberEmail: receipt.charge.member.email,
      concept: receipt.charge.concept,
      amount: Number(receipt.charge.amount),
      method: receipt.payment.method,
      cardLast4: receipt.payment.cardLast4,
    };
  }
}
