import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { CHARGES_SERVICE, type ChargesService } from '@Common/contracts';
import { PaymentGatewayService } from '@Payments/services';

/**
 * Prueba de integración de H15 contra la base de datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido.
 * Crea sus propios cobros para miembro@gymhub.test y los borra al terminar.
 */
const PASSWORD = 'Demo1234!';
const CONCEPT_PREFIX = '[e2e H15]';

describe('Pagos · H15 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let receptionToken: string;
  let memberToken: string;
  let trainerToken: string;
  let memberId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const createCharge = (
    amount: number,
    type: 'MEMBERSHIP' | 'PERSONAL_SESSION' = 'MEMBERSHIP',
  ) =>
    prisma.charge.create({
      data: {
        memberId,
        type,
        concept: `${CONCEPT_PREFIX} ${type} ${randomUUID().slice(0, 8)}`,
        amount,
        dueDate: new Date(),
      },
    });

  const pay = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const card = (cardNumber: string) => ({
    cardNumber,
    holderName: 'Ana Pérez',
    expiry: '12/30',
    cvv: '123',
  });

  async function cleanUp(): Promise<void> {
    const where = { charge: { concept: { startsWith: CONCEPT_PREFIX } } };
    await prisma.receipt.deleteMany({ where });
    await prisma.payment.deleteMany({ where });
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

    // La pasarela real espera 2 s; aquí basta con un poco para probar la concurrencia.
    app.get(PaymentGatewayService).delayMs = 100;
    prisma = app.get(PrismaService);
    memberId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'miembro@gymhub.test' },
      })
    ).id;
    await cleanUp();

    receptionToken = await login('recepcion@gymhub.test');
    memberToken = await login('miembro@gymhub.test');
    trainerToken = await login('entrenador@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('lista los cobros pendientes del miembro y responde 403 a otros roles', async () => {
    const charge = await createCharge(25);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/members/${memberId}/charges?status=PENDING`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .expect(200);
    expect(res.body.data).toContainEqual(
      expect.objectContaining({
        chargeId: charge.id,
        amount: 25,
        status: 'PENDING',
      }),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/members/${memberId}/charges`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/members/${randomUUID()}/charges`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .expect(404);
  });

  it('busca miembros por correo', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/charges/member-search?q=MIEMBRO')
      .set('Authorization', `Bearer ${receptionToken}`)
      .expect(200);
    expect(res.body.data).toEqual([{ memberId, email: 'miembro@gymhub.test' }]);
  });

  it('en efectivo: 201, cobro PAID, la misma clave no cobra dos veces y otra clave da 409', async () => {
    const charge = await createCharge(25);
    const body = {
      chargeId: charge.id,
      paymentMethod: 'CASH',
      idempotencyKey: randomUUID(),
    };

    const first = await pay(receptionToken, body).expect(201);
    expect(first.body).toMatchObject({
      chargeId: charge.id,
      amount: 25,
      paymentMethod: 'CASH',
    });
    expect(first.body.receiptNumber).toMatch(/^C-\d{6}$/);
    await expect(
      prisma.charge.findUniqueOrThrow({ where: { id: charge.id } }),
    ).resolves.toMatchObject({ status: 'PAID' });

    const again = await pay(receptionToken, body).expect(201);
    expect(again.body.paymentId).toBe(first.body.paymentId);
    await expect(
      prisma.payment.count({ where: { chargeId: charge.id } }),
    ).resolves.toBe(1);

    const other = await pay(receptionToken, {
      ...body,
      idempotencyKey: randomUUID(),
    }).expect(409);
    expect(other.body.message).toBe('Este cobro ya está pagado.');
  });

  it('tarjeta rechazada: 400 con el motivo, se guarda el intento y el cobro sigue PENDING', async () => {
    const charge = await createCharge(15, 'PERSONAL_SESSION');

    const res = await pay(receptionToken, {
      chargeId: charge.id,
      paymentMethod: 'CARD',
      card: card('4000 0000 0000 0002'),
      idempotencyKey: randomUUID(),
    }).expect(400);

    expect(res.body.message).toBe('Fondos insuficientes');
    await expect(
      prisma.charge.findUniqueOrThrow({ where: { id: charge.id } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    await expect(
      prisma.payment.findFirstOrThrow({ where: { chargeId: charge.id } }),
    ).resolves.toMatchObject({ result: 'DECLINED', cardLast4: '0002' });
  });

  it('tarjeta 4242 aprueba y el monto sale del cobro, no de la solicitud', async () => {
    const charge = await createCharge(15, 'PERSONAL_SESSION');

    const res = await pay(receptionToken, {
      chargeId: charge.id,
      paymentMethod: 'CARD',
      card: card('4242424242424242'),
      idempotencyKey: randomUUID(),
    }).expect(201);

    expect(res.body).toMatchObject({
      amount: 15,
      cardLast4: '4242',
      paymentMethod: 'CARD',
    });
  });

  it('rechaza un monto en la solicitud y la tarjeta sin datos', async () => {
    const charge = await createCharge(25);

    await pay(receptionToken, {
      chargeId: charge.id,
      paymentMethod: 'CASH',
      amount: 1,
      idempotencyKey: randomUUID(),
    }).expect(400);
    await pay(receptionToken, {
      chargeId: charge.id,
      paymentMethod: 'CARD',
      idempotencyKey: randomUUID(),
    }).expect(400);
  });

  it('dos cobros simultáneos del mismo cargo: uno 201 y el otro 409', async () => {
    const charge = await createCharge(25);
    const attempt = () =>
      pay(receptionToken, {
        chargeId: charge.id,
        paymentMethod: 'CARD',
        card: card('4242424242424242'),
        idempotencyKey: randomUUID(),
      });

    const statuses = (await Promise.all([attempt(), attempt()])).map(
      (r) => r.status,
    );

    expect(statuses.sort((a, b) => a - b)).toEqual([201, 409]);
    await expect(
      prisma.payment.count({
        where: { chargeId: charge.id, result: 'APPROVED' },
      }),
    ).resolves.toBe(1);
  });

  it('doble clic con la misma clave: un solo pago', async () => {
    const charge = await createCharge(25);
    const body = {
      chargeId: charge.id,
      paymentMethod: 'CARD',
      card: card('4242424242424242'),
      idempotencyKey: randomUUID(),
    };

    const [a, b] = await Promise.all([
      pay(receptionToken, body),
      pay(receptionToken, body),
    ]);

    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.paymentId).toBe(b.body.paymentId);
    await expect(
      prisma.payment.count({ where: { chargeId: charge.id } }),
    ).resolves.toBe(1);
  });

  it('404 si el cobro no existe y 403 si quien paga es Miembro', async () => {
    await pay(receptionToken, {
      chargeId: 999_999,
      paymentMethod: 'CASH',
      idempotencyKey: randomUUID(),
    }).expect(404);
    await pay(memberToken, {
      chargeId: 1,
      paymentMethod: 'CASH',
      idempotencyKey: randomUUID(),
    }).expect(403);
  });

  it('PDF del comprobante: Recepción y el dueño sí; otro usuario recibe 404', async () => {
    const charge = await createCharge(25);
    const paid = await pay(receptionToken, {
      chargeId: charge.id,
      paymentMethod: 'CASH',
      idempotencyKey: randomUUID(),
    }).expect(201);
    const url = `/api/v1/receipts/${paid.body.receiptId}/pdf`;

    const res = await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${receptionToken}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(
      `comprobante-${paid.body.receiptNumber}.pdf`,
    );
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${trainerToken}`)
      .expect(404);
  });

  it('createPending del contrato se revierte con la transacción de quien llama', async () => {
    const charges = app.get<ChargesService>(CHARGES_SERVICE);
    const concept = `${CONCEPT_PREFIX} revertido`;

    await expect(
      prisma.$transaction(async (tx) => {
        await charges.createPending(
          {
            memberId,
            type: 'MEMBERSHIP',
            concept,
            amount: 25,
            dueDate: new Date(),
          },
          tx,
        );
        throw new Error('falla de quien llama');
      }),
    ).rejects.toThrow('falla de quien llama');

    await expect(prisma.charge.count({ where: { concept } })).resolves.toBe(0);
  });

  it('la base rechaza un segundo comprobante del mismo cobro y montos <= 0', async () => {
    const charge = await createCharge(25);
    const paid = await pay(receptionToken, {
      chargeId: charge.id,
      paymentMethod: 'CASH',
      idempotencyKey: randomUUID(),
    }).expect(201);

    const recepcion = await prisma.user.findUniqueOrThrow({
      where: { email: 'recepcion@gymhub.test' },
    });
    const payment = await prisma.payment.create({
      data: {
        chargeId: charge.id,
        method: 'CASH',
        result: 'APPROVED',
        idempotencyKey: randomUUID(),
        registeredById: recepcion.id,
      },
    });
    await expect(
      prisma.receipt.create({
        data: {
          number: 'C-999999',
          paymentId: payment.id,
          chargeId: paid.body.chargeId,
        },
      }),
    ).rejects.toThrow();
    await expect(createCharge(-1)).rejects.toThrow();
  });
});
