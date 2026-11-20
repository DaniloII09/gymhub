import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';

/**
 * Prueba de integración de H29 (ingresos de un periodo) contra la base real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido.
 * Crea sus propios comprobantes en el año 2020, donde no hay datos del seed ni
 * de otras pruebas, así los totales se pueden comparar exactos. Los borra al
 * terminar.
 */
const PASSWORD = 'Demo1234!';
const CONCEPT_PREFIX = '[e2e H29]';

type ChargeType = 'MEMBERSHIP' | 'DROP_IN' | 'PERSONAL_SESSION';

describe('Reportes · H29 ingresos de un periodo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let memberId: string;
  let receptionId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const income = (token: string | null, query: string) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/reports/income${query}`,
    );
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  /** Cobro pagado con su pago aprobado y su comprobante emitido en `issuedAt` (UTC). */
  async function paidReceipt(
    type: ChargeType,
    amount: number,
    issuedAt: string,
  ) {
    const when = new Date(issuedAt);
    await prisma.$transaction(async (tx) => {
      const charge = await tx.charge.create({
        data: {
          memberId,
          type,
          concept: `${CONCEPT_PREFIX} ${type} ${randomUUID().slice(0, 8)}`,
          amount,
          dueDate: when,
          status: 'PAID',
          paidAt: when,
        },
      });
      const payment = await tx.payment.create({
        data: {
          chargeId: charge.id,
          method: 'CASH',
          result: 'APPROVED',
          idempotencyKey: randomUUID(),
          registeredById: receptionId,
          createdAt: when,
        },
      });
      const [{ next }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT nextval(pg_get_serial_sequence('receipts', 'id')) AS next`;
      await tx.receipt.create({
        data: {
          id: Number(next),
          number: `C-${String(next).padStart(6, '0')}`,
          paymentId: payment.id,
          chargeId: charge.id,
          issuedAt: when,
        },
      });
    });
  }

  async function cleanUp(): Promise<void> {
    const own = { charge: { concept: { startsWith: CONCEPT_PREFIX } } };
    await prisma.receipt.deleteMany({ where: own });
    await prisma.payment.deleteMany({ where: own });
    await prisma.charge.deleteMany({
      where: { concept: { startsWith: CONCEPT_PREFIX } },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Igual que main.ts.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    memberId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'miembro@gymhub.test' },
      })
    ).id;
    receptionId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'recepcion@gymhub.test' },
      })
    ).id;
    await cleanUp();

    // Enero 2020: membresía y clase suelta.
    await paidReceipt('MEMBERSHIP', 25, '2020-01-10T18:00:00Z');
    await paidReceipt('DROP_IN', 5, '2020-01-20T18:00:00Z');
    // Febrero 2020: sin pagos.
    // Marzo 2020: membresía, dos sesiones personales y una clase suelta.
    await paidReceipt('MEMBERSHIP', 60, '2020-03-02T18:00:00Z');
    await paidReceipt('PERSONAL_SESSION', 15, '2020-03-15T18:00:00Z');
    await paidReceipt('PERSONAL_SESSION', 15.5, '2020-03-20T18:00:00Z');
    // 31/03 a las 21:00 en El Salvador: en UTC ya es 1/04, pero entra en marzo.
    await paidReceipt('DROP_IN', 5, '2020-04-01T03:00:00Z');
    // 31/12/2019 a las 23:00 en El Salvador: en UTC ya es 2020, pero queda fuera.
    await paidReceipt('MEMBERSHIP', 99, '2020-01-01T05:00:00Z');

    adminToken = await login('admin@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('separa el total por membresías, clases sueltas y sesiones personales, y por mes', async () => {
    const res = await income(
      adminToken,
      '?from=2020-01-01&to=2020-03-31',
    ).expect(200);

    expect(res.body.from).toBe('2020-01-01');
    expect(res.body.to).toBe('2020-03-31');
    expect(res.body.totals).toEqual({
      membership: 85,
      dropIn: 10,
      personalSession: 30.5,
      total: 125.5,
      receiptCount: 6,
    });
    expect(res.body.months).toEqual([
      {
        month: '2020-01',
        membership: 25,
        dropIn: 5,
        personalSession: 0,
        total: 30,
        receiptCount: 2,
      },
      {
        month: '2020-02',
        membership: 0,
        dropIn: 0,
        personalSession: 0,
        total: 0,
        receiptCount: 0,
      },
      {
        month: '2020-03',
        membership: 60,
        dropIn: 5,
        personalSession: 30.5,
        total: 95.5,
        receiptCount: 4,
      },
    ]);
    expect(res.body.message).toBeNull();
  });

  it('el total coincide con los comprobantes emitidos en el rango (fecha de emisión en El Salvador)', async () => {
    const res = await income(
      adminToken,
      '?from=2020-01-01&to=2020-03-31',
    ).expect(200);

    const [own] = await prisma.$queryRaw<{ total: string; count: number }[]>`
      SELECT COALESCE(SUM(c.amount), 0)::text AS total, COUNT(*)::int AS count
        FROM receipts r JOIN charges c ON c.id = r.charge_id
       WHERE timezone('America/El_Salvador', r.issued_at AT TIME ZONE 'UTC')::date
             BETWEEN '2020-01-01' AND '2020-03-31'`;
    expect(res.body.totals.total).toBe(Number(own.total));
    expect(res.body.totals.receiptCount).toBe(own.count);
  });

  it('un rango de un solo día cuenta el comprobante que en UTC cae al día siguiente', async () => {
    const res = await income(
      adminToken,
      '?from=2020-03-31&to=2020-03-31',
    ).expect(200);
    expect(res.body.totals).toMatchObject({
      dropIn: 5,
      total: 5,
      receiptCount: 1,
    });

    const newYear = await income(
      adminToken,
      '?from=2019-12-31&to=2019-12-31',
    ).expect(200);
    expect(newYear.body.totals).toMatchObject({
      membership: 99,
      total: 99,
      receiptCount: 1,
    });
  });

  it('sin pagos en el rango responde $0.00 y "No hay pagos en ese rango."', async () => {
    const res = await income(
      adminToken,
      '?from=2020-02-01&to=2020-02-29',
    ).expect(200);
    expect(res.body.totals).toEqual({
      membership: 0,
      dropIn: 0,
      personalSession: 0,
      total: 0,
      receiptCount: 0,
    });
    expect(res.body.months).toHaveLength(1);
    expect(res.body.message).toBe('No hay pagos en ese rango.');
  });

  it('acepta hasta 12 meses', async () => {
    const res = await income(
      adminToken,
      '?from=2020-01-01&to=2020-12-31',
    ).expect(200);
    expect(res.body.months).toHaveLength(12);
  });

  it.each([
    [
      '?from=2020-03-31&to=2020-01-01',
      'La fecha de inicio no puede ser posterior a la de fin.',
    ],
    [
      '?from=2020-01-01&to=2021-01-01',
      'El rango no puede ser mayor a 12 meses.',
    ],
    ['?from=2021-02-29&to=2021-03-10', 'La fecha 2021-02-29 no existe.'],
  ])('con %s responde 400 con el motivo', async (query, message) => {
    const res = await income(adminToken, query).expect(400);
    expect(res.body.message).toBe(message);
  });

  it.each([['?from=01/01/2020&to=2020-03-31'], ['?from=2020-01-01'], ['']])(
    'con fechas en otro formato o faltantes (%s) responde 400',
    async (query) => {
      const res = await income(adminToken, query).expect(400);
      expect(res.body.message).toContain(
        'Las fechas deben tener el formato AAAA-MM-DD.',
      );
    },
  );

  it.each([
    ['recepcion@gymhub.test'],
    ['entrenador@gymhub.test'],
    ['miembro@gymhub.test'],
  ])('%s no puede ver el reporte (403)', async (email) => {
    await income(await login(email), '?from=2020-01-01&to=2020-03-31').expect(
      403,
    );
  });

  it('sin sesión responde 401', async () => {
    await income(null, '?from=2020-01-01&to=2020-03-31').expect(401);
  });
});
