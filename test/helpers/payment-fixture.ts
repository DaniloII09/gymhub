import { PaymentRepository } from '../../src/payments/repositories/payment.repository.js';
import { PaymentGatewayService } from '../../src/payments/services/payment-gateway.service.js';
import { PaymentsService } from '../../src/payments/services/payments.service.js';

export const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_MEMBER_ID = '33333333-3333-4333-8333-333333333333';
export const RECEPTION_ID = '22222222-2222-4222-8222-222222222222';
export const APPROVED_CARD = {
  cardNumber: '4242 4242 4242 4242',
  holderName: 'Juan Perez',
  expiry: '12/30',
  cvv: '123',
};
export const DECLINED_CARD = {
  ...APPROVED_CARD,
  cardNumber: '4000 0000 0000 0002',
};

interface FakeCharge {
  id: number;
  memberId: string;
  type: 'MEMBERSHIP' | 'PERSONAL_SESSION' | 'DROP_IN';
  concept: string;
  amount: number;
  status: 'PENDING' | 'PAID';
  paidAt: Date | null;
}

/**
 * PaymentRepository y PaymentsService reales sobre una base en memoria: la
 * transacción simulada guarda cobros, intentos y comprobantes, así que un
 * segundo pago ve lo que dejó el primero. La pasarela es la real, sin la
 * espera de 2 s.
 */
export function paymentFixture(charges: Partial<FakeCharge>[] = [{}]) {
  const db = {
    charges: charges.map<FakeCharge>((c, i) => ({
      id: i + 1,
      memberId: MEMBER_ID,
      type: 'MEMBERSHIP',
      concept: 'Membresía Mensual',
      amount: 25,
      status: 'PENDING',
      paidAt: null,
      ...c,
    })),
    payments: [] as Record<string, unknown>[],
    receipts: [] as {
      id: number;
      number: string;
      paymentId: number;
      chargeId: number;
      issuedAt: Date;
    }[],
  };
  let nextReceipt = 7;

  const withReceipt = (p: Record<string, unknown> | undefined) =>
    p && {
      ...p,
      charge: db.charges.find((c) => c.id === p.chargeId),
      receipt: db.receipts.find((r) => r.paymentId === p.id) ?? null,
    };

  const tx = {
    $queryRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (sql.includes('nextval')) return [{ next: BigInt(nextReceipt++) }];
        const charge = db.charges.find((c) => c.id === values[0]);
        return charge ? [{ id: charge.id }] : [];
      },
    ),
    charge: {
      findUniqueOrThrow: vi.fn(async ({ where }) => {
        const c = db.charges.find((x) => x.id === where.id);
        if (!c) throw new Error('not found');
        return { ...c, amount: c.amount };
      }),
      update: vi.fn(async ({ where, data }) => {
        const c = db.charges.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return c;
      }),
    },
    payment: {
      findUnique: vi.fn(
        async ({ where }) =>
          withReceipt(
            db.payments.find((p) => p.idempotencyKey === where.idempotencyKey),
          ) ?? null,
      ),
      create: vi.fn(async ({ data }) => {
        const p = { id: db.payments.length + 1, ...data };
        db.payments.push(p);
        return p;
      }),
    },
    receipt: {
      create: vi.fn(async ({ data }) => {
        const r = { ...data, issuedAt: new Date('2026-11-19T18:00:00.000Z') };
        db.receipts.push(r);
        return r;
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    payment: { findUnique: tx.payment.findUnique },
  };

  const repository = new PaymentRepository(prisma as never);
  const gateway = new PaymentGatewayService();
  gateway.delayMs = 0;
  const membershipStatus = { statusFor: vi.fn().mockResolvedValue('ACTIVE') };
  const service = new PaymentsService(
    repository,
    gateway,
    membershipStatus as never,
  );
  return { db, tx, repository, gateway, membershipStatus, service };
}
