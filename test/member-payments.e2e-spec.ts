import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { PaymentGatewayService } from '@Payments/services';
import { MEMBERSHIP_STATUS_SERVICE, type MembershipStatusService } from '@Common/contracts';

/**
 * Prueba de integración de H16 (pago en línea del miembro) contra la base de
 * datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido.
 * Crea sus propios cobros para miembro@gymhub.test y ana.gomez@gymhub.test y
 * los borra al terminar.
 */
const PASSWORD = 'Demo1234!';
const CONCEPT_PREFIX = '[e2e H16]';
const APPROVED_CARD = '4242424242424242';
const DECLINED_CARD = '4000000000000002';

describe('Pagos · H16 mis pagos y pago en línea (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let memberToken: string;
  let otherMemberToken: string;
  let receptionToken: string;
  let memberId: string;
  let otherMemberId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const createCharge = (
    owner: string,
    amount = 25,
    type: 'MEMBERSHIP' | 'PERSONAL_SESSION' = 'MEMBERSHIP',
  ) =>
    prisma.charge.create({
      data: {
        memberId: owner,
        type,
        concept: `${CONCEPT_PREFIX} ${type} ${randomUUID().slice(0, 8)}`,
        amount,
        dueDate: new Date(),
      },
    });

  const card = (cardNumber: string) => ({
    cardNumber,
    holderName: 'Juan Perez',
    expiry: '12/30',
    cvv: '123',
  });

  const payOnline = (
    token: string,
    chargeId: number | string,
    body: object = {
      card: card(APPROVED_CARD),
      idempotencyKey: randomUUID(),
    },
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1/charges/${chargeId}/card-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const get = (token: string, url: string) =>
    request(app.getHttpServer())
      .get(`/api/v1${url}`)
      .set('Authorization', `Bearer ${token}`);

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
    const idOf = async (email: string) =>
      (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    memberId = await idOf('miembro@gymhub.test');
    otherMemberId = await idOf('ana.gomez@gymhub.test');
    await cleanUp();

    memberToken = await login('miembro@gymhub.test');
    otherMemberToken = await login('ana.gomez@gymhub.test');
    receptionToken = await login('recepcion@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  describe('GET /charges/me (BE-16.1)', () => {
    it('solo devuelve los cobros del miembro autenticado', async () => {
      const mine = await createCharge(memberId);
      const others = await createCharge(otherMemberId);

      const res = await get(memberToken, '/charges/me?status=PENDING').expect(
        200,
      );

      const ids = (res.body.data as { chargeId: number }[]).map(
        (charge) => charge.chargeId,
      );
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(others.id);
      expect(res.body.data).toContainEqual(
        expect.objectContaining({
          chargeId: mine.id,
          concept: mine.concept,
          amount: 25,
          dueDate: mine.dueDate.toISOString().slice(0, 10),
          status: 'PENDING',
        }),
      );
    });

    it('con rol Recepción responde 403 y sin sesión 401', async () => {
      await get(receptionToken, '/charges/me').expect(403);
      await request(app.getHttpServer()).get('/api/v1/charges/me').expect(401);
    });

    it('un estado no válido responde 400', async () => {
      await get(memberToken, '/charges/me?status=PAGADO').expect(400);
    });
  });

  describe('POST /charges/{chargeId}/card-payment (BE-16.2)', () => {
    it('con la tarjeta 4242 responde 201, el cobro queda PAID y aparece en mis comprobantes', async () => {
      const charge = await createCharge(memberId, 30);

      const res = await payOnline(memberToken, charge.id).expect(201);

      expect(res.body).toMatchObject({
        chargeId: charge.id,
        status: 'PAID',
        amount: 30,
        paymentMethod: 'CARD',
        cardLast4: '4242',
      });
      // H04 registra el contrato de estado: el pago responde el estado actual
      // de la membresía del miembro, el mismo que calcula BE-4.3.
      const current = await app
        .get<MembershipStatusService>(MEMBERSHIP_STATUS_SERVICE)
        .currentFor(memberId);
      expect(res.body.membershipStatus).toBe(current.status);
      expect(res.body.receiptNumber).toMatch(/^C-\d{6}$/);

      const saved = await prisma.charge.findUniqueOrThrow({
        where: { id: charge.id },
        include: { payments: true },
      });
      expect(saved.status).toBe('PAID');
      expect(saved.payments).toHaveLength(1);
      // Nunca se guarda el número completo de la tarjeta.
      expect(saved.payments[0].cardLast4).toBe('4242');
      // El miembro quedó como quien registró su propio pago.
      expect(saved.payments[0].registeredById).toBe(memberId);

      const receipts = await get(memberToken, '/receipts/me').expect(200);
      expect(receipts.body.data[0]).toMatchObject({
        receiptId: res.body.receiptId,
        number: res.body.receiptNumber,
        concept: charge.concept,
        amount: 30,
        method: 'CARD',
      });
    });

    it('con la tarjeta 0002 responde 400 con el motivo y el cobro sigue PENDING', async () => {
      const charge = await createCharge(memberId);

      const res = await payOnline(memberToken, charge.id, {
        card: card(DECLINED_CARD),
        idempotencyKey: randomUUID(),
      }).expect(400);

      expect(res.body.message).toBe('Fondos insuficientes');
      const saved = await prisma.charge.findUniqueOrThrow({
        where: { id: charge.id },
        include: { payments: true },
      });
      expect(saved.status).toBe('PENDING');
      expect(saved.payments).toEqual([
        expect.objectContaining({
          result: 'DECLINED',
          declineReason: 'Fondos insuficientes',
        }),
      ]);
    });

    it('el cobro de otro miembro responde 404 sin pagarlo', async () => {
      const others = await createCharge(otherMemberId);

      const res = await payOnline(memberToken, others.id).expect(404);

      expect(res.body.message).toBe('No encontramos ese cobro.');
      expect(
        await prisma.payment.count({ where: { chargeId: others.id } }),
      ).toBe(0);
    });

    it('un cobro inexistente también responde 404', async () => {
      await payOnline(memberToken, 2_000_000_000).expect(404);
      await payOnline(memberToken, 2_147_483_648).expect(404);
    });

    it('pagar un cobro ya pagado responde 409 "Este cobro ya está pagado."', async () => {
      const charge = await createCharge(memberId);
      await payOnline(memberToken, charge.id).expect(201);

      const res = await payOnline(memberToken, charge.id).expect(409);

      expect(res.body.message).toBe('Este cobro ya está pagado.');
    });

    it('dos solicitudes simultáneas con claves distintas producen un solo pago APROBADO', async () => {
      const charge = await createCharge(memberId);

      const [first, second] = await Promise.all([
        payOnline(memberToken, charge.id),
        payOnline(memberToken, charge.id),
      ]);

      expect([first.status, second.status].sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(
        await prisma.payment.count({
          where: { chargeId: charge.id, result: 'APPROVED' },
        }),
      ).toBe(1);
    });

    it('doble clic con la misma clave: un solo pago y la misma respuesta', async () => {
      const charge = await createCharge(memberId);
      const body = { card: card(APPROVED_CARD), idempotencyKey: randomUUID() };

      const [first, second] = await Promise.all([
        payOnline(memberToken, charge.id, body),
        payOnline(memberToken, charge.id, body),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.receiptNumber).toBe(first.body.receiptNumber);
      expect(
        await prisma.payment.count({ where: { chargeId: charge.id } }),
      ).toBe(1);
    });

    it('la clave de un pago ajeno no revela nada: responde 404', async () => {
      const others = await createCharge(otherMemberId);
      const body = { card: card(APPROVED_CARD), idempotencyKey: randomUUID() };
      await payOnline(otherMemberToken, others.id, body).expect(201);

      await payOnline(memberToken, others.id, body).expect(404);
    });

    it('rechaza la solicitud sin tarjeta, con datos inválidos o con monto', async () => {
      const charge = await createCharge(memberId);

      const noCard = await payOnline(memberToken, charge.id, {
        idempotencyKey: randomUUID(),
      }).expect(400);
      expect(noCard.body.message).toContain('Faltan los datos de la tarjeta.');

      await payOnline(memberToken, charge.id, {
        card: { ...card(APPROVED_CARD), cvv: '12' },
        idempotencyKey: randomUUID(),
      }).expect(400);

      // El monto sale del cobro: la solicitud no lo puede traer.
      await payOnline(memberToken, charge.id, {
        card: card(APPROVED_CARD),
        idempotencyKey: randomUUID(),
        amount: 1,
      }).expect(400);

      await payOnline(memberToken, 'abc').expect(400);
    });

    it('con rol Recepción responde 403 y sin sesión 401', async () => {
      const charge = await createCharge(memberId);

      await payOnline(receptionToken, charge.id).expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/charges/${charge.id}/card-payment`)
        .send({ card: card(APPROVED_CARD), idempotencyKey: randomUUID() })
        .expect(401);
    });
  });

  describe('GET /receipts/me (BE-16.1)', () => {
    it('lista solo mis comprobantes, del más reciente al más antiguo, 20 por página', async () => {
      const older = await createCharge(memberId, 11);
      const newer = await createCharge(memberId, 12);
      const others = await createCharge(otherMemberId, 13);
      await payOnline(memberToken, older.id).expect(201);
      await payOnline(memberToken, newer.id).expect(201);
      await payOnline(otherMemberToken, others.id).expect(201);

      const res = await get(memberToken, '/receipts/me?page=1').expect(200);

      expect(res.body).toMatchObject({ page: 1, pageSize: 20 });
      const concepts = (res.body.data as { concept: string }[]).map(
        (receipt) => receipt.concept,
      );
      expect(concepts.indexOf(newer.concept)).toBeLessThan(
        concepts.indexOf(older.concept),
      );
      expect(concepts).not.toContain(others.concept);
      const dates = (res.body.data as { issuedAt: string }[]).map((receipt) =>
        Date.parse(receipt.issuedAt),
      );
      expect(dates).toEqual([...dates].sort((a, b) => b - a));
    });

    it('con rol Recepción responde 403 y una página no válida 400', async () => {
      await get(receptionToken, '/receipts/me').expect(403);
      await get(memberToken, '/receipts/me?page=0').expect(400);
    });
  });
});
