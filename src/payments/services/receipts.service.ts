import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ReceiptRepository, type ReceiptDetail } from '@Payments/repositories';
import type { User } from '@PrismaClient';

export const RECEIPT_NOT_FOUND_MESSAGE = 'No encontramos ese comprobante.';

/** Roles que pueden ver el comprobante de cualquier miembro. */
const STAFF_ROLES: User['role'][] = ['RECEPTION', 'ADMIN'];

const METHOD_LABEL = { CASH: 'Efectivo', CARD: 'Tarjeta' } as const;

/** Comprobante en PDF (BE-15.4). */
@Injectable()
export class ReceiptsService {
  constructor(private readonly receiptRepository: ReceiptRepository) {}

  /**
   * Lo pueden pedir Recepción, Administrador o el Miembro dueño del cobro.
   * A cualquier otro se le responde 404, igual que si no existiera, para no
   * revelar qué comprobantes existen.
   */
  async getPdf(
    receiptId: number,
    requester: Pick<User, 'id' | 'role'>,
  ): Promise<{ number: string; pdf: Buffer }> {
    const receipt = await this.receiptRepository.findDetail(receiptId);
    const canSee =
      receipt !== null &&
      (STAFF_ROLES.includes(requester.role) ||
        receipt.memberId === requester.id);
    if (!receipt || !canSee) {
      throw new NotFoundException(RECEIPT_NOT_FOUND_MESSAGE);
    }
    return { number: receipt.number, pdf: await this.render(receipt) };
  }

  /** El PDF se arma en el servidor solo con los datos guardados del comprobante. */
  private render(receipt: ReceiptDetail): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 60 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const method = receipt.cardLast4
        ? `${METHOD_LABEL[receipt.method]} terminada en ${receipt.cardLast4}`
        : METHOD_LABEL[receipt.method];
      const rows: [string, string][] = [
        ['Número', receipt.number],
        [
          'Fecha',
          receipt.issuedAt.toLocaleString('es-SV', {
            timeZone: 'America/El_Salvador',
          }),
        ],
        ['Miembro', receipt.memberEmail],
        ['Concepto', receipt.concept],
        ['Monto', `$${receipt.amount.toFixed(2)}`],
        ['Método de pago', method],
      ];

      doc.fontSize(18).text('GymHub', { align: 'center' });
      doc.fontSize(13).text('Comprobante de pago', { align: 'center' });
      doc.moveDown(1.5).fontSize(11);
      for (const [label, value] of rows) {
        doc
          .font('Helvetica-Bold')
          .text(`${label}: `, { continued: true })
          .font('Helvetica')
          .text(value);
        doc.moveDown(0.4);
      }
      doc
        .moveDown(1)
        .fontSize(9)
        .fillColor('#555555')
        .text('Comprobante generado con los datos guardados del pago.');
      doc.end();
    });
  }
}
