import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { toSkipTake } from '@Common/pagination';
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

/** Un comprobante en la lista "Mis pagos" (H16). */
export interface ReceiptSummary {
  id: number;
  number: string;
  issuedAt: Date;
  concept: string;
  amount: number;
  method: PaymentMethod;
  cardLast4: string | null;
}

/** Único punto del módulo que lee la tabla `receipts`. */
@Injectable()
export class ReceiptRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Comprobantes del miembro, del más reciente al más antiguo. */
  async findByMember(
    memberId: string,
    page: { page: number; pageSize: number },
  ): Promise<{ rows: ReceiptSummary[]; total: number }> {
    const where = { charge: { memberId } };
    const [receipts, total] = await this.prisma.$transaction([
      this.prisma.receipt.findMany({
        where,
        include: {
          payment: { select: { method: true, cardLast4: true } },
          charge: { select: { concept: true, amount: true } },
        },
        // `id` desempata dos comprobantes emitidos en el mismo instante.
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(page),
      }),
      this.prisma.receipt.count({ where }),
    ]);

    return {
      total,
      rows: receipts.map((receipt) => ({
        id: receipt.id,
        number: receipt.number,
        issuedAt: receipt.issuedAt,
        concept: receipt.charge.concept,
        amount: Number(receipt.charge.amount),
        method: receipt.payment.method,
        cardLast4: receipt.payment.cardLast4,
      })),
    };
  }

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
