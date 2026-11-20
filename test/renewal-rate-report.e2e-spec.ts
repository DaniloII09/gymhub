import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '@Prisma/services';

/**
 * Prueba de integración de H30 (tasa de renovación de membresías) contra
 * PostgreSQL real.
 *
 * Crea sus propios miembros (e2e.h30.*) y membresías en 2020 (rango aislado del
 * seed y de otras pruebas) y los elimina al terminar.
 */
const PASSWORD = 'Demo1234!';
const EMAIL_PREFIX = 'e2e.h30.';

describe('Reportes · H30 tasa de renovación (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let memberToken: string;
  let trainerToken: string;
  let receptionToken: string;
  let creatorId: string;
  let monthlyPlanId: number;
  let quarterlyPlanId: number;
  let dropInPlanId: number;

  const api = () => request(app.getHttpServer());

  const login = async (email: string) => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const dbDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  async function createMember() {
    const passwordHash = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@gymhub.test' } })
    ).passwordHash;
    return prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}${randomUUID()}@gymhub.test`,
        fullName: `Miembro H30 ${randomUUID().slice(0, 6)}`,
        role: 'MEMBER',
        memberCode: `GYM-4${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
        passwordHash,
      },
    });
  }

  async function createMembership(
    memberId: string,
    planType: 'MONTHLY' | 'QUARTERLY' | 'DROP_IN',
    startDate: string,
    endDate: string,
    paid = true,
  ) {
    const planId =
      planType === 'MONTHLY'
        ? monthlyPlanId
        : planType === 'QUARTERLY'
          ? quarterlyPlanId
          : dropInPlanId;
    const membership = await prisma.membership.create({
      data: {
        memberId,
        planId,
        planType,
        startDate: dbDate(startDate),
        endDate: dbDate(endDate),
        status: paid ? 'EXPIRED' : 'PENDING_PAYMENT',
        createdById: creatorId,
      },
    });
    await prisma.charge.create({
      data: {
        memberId,
        type: planType === 'DROP_IN' ? 'DROP_IN' : 'MEMBERSHIP',
        concept: `[e2e H30] ${planType}`,
        amount: planType === 'QUARTERLY' ? 65 : planType === 'DROP_IN' ? 5 : 25,
        dueDate: dbDate(startDate),
        membershipId: membership.id,
        ...(paid ? { status: 'PAID' as const, paidAt: dbDate(startDate) } : {}),
      },
    });
    return membership;
  }

  async function cleanUp() {
    const ofMembers = { member: { email: { startsWith: EMAIL_PREFIX } } };
    await prisma.charge.deleteMany({ where: ofMembers });
    await prisma.membership.deleteMany({ where: ofMembers });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await cleanUp();

    adminToken = await login('admin@gymhub.test');
    memberToken = await login('miembro@gymhub.test');
    trainerToken = await login('entrenador@gymhub.test');
    receptionToken = await login('recepcion@gymhub.test');
    creatorId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@gymhub.test' } })
    ).id;
    monthlyPlanId = (await prisma.plan.findUniqueOrThrow({ where: { name: 'Mensual' } })).id;
    quarterlyPlanId = (await prisma.plan.findUniqueOrThrow({ where: { name: 'Trimestral' } })).id;
    dropInPlanId = (await prisma.plan.findUniqueOrThrow({ where: { name: 'Clase suelta' } })).id;

    // Enero 2020: 4 vencidas válidas (3 renovadas = 75.0%), más exclusiones.
    // 1) Mensual vencida el 2020-01-15, renovada al día siguiente (2020-01-16, termina en febrero -> sin contar 2 veces).
    const mRenewNextDay = await createMember();
    await createMembership(mRenewNextDay.id, 'MONTHLY', '2019-12-17', '2020-01-15', true);
    await createMembership(mRenewNextDay.id, 'MONTHLY', '2020-01-16', '2020-02-14', true);
    // Una segunda renovación en ventana (2020-01-20) NO debe duplicar la vencida de enero.
    await createMembership(mRenewNextDay.id, 'MONTHLY', '2020-01-20', '2020-02-18', true);

    // 2) Trimestral vencida el 2020-01-20, renovada exactamente a los 7 días (2020-01-27).
    const mRenewDay7 = await createMember();
    await createMembership(mRenewDay7.id, 'QUARTERLY', '2019-10-23', '2020-01-20', true);
    await createMembership(mRenewDay7.id, 'MONTHLY', '2020-01-27', '2020-02-25', true);

    // 3) Mensual vencida el 2020-01-25, renovada ANTES de vencer (inicia 2020-01-22, después de startDate).
    const mRenewBeforeExpiry = await createMember();
    await createMembership(mRenewBeforeExpiry.id, 'MONTHLY', '2019-12-27', '2020-01-25', true);
    await createMembership(mRenewBeforeExpiry.id, 'MONTHLY', '2020-01-22', '2020-02-20', true);

    // 4) Mensual vencida el 2020-01-10, renovada a los 8 días (2020-01-18) -> NO cuenta como renovada.
    const mRenewDay8 = await createMember();
    await createMembership(mRenewDay8.id, 'MONTHLY', '2019-12-12', '2020-01-10', true);
    await createMembership(mRenewDay8.id, 'MONTHLY', '2020-01-18', '2020-02-16', true);

    // Exclusiones que NO deben alterar el denominador ni el numerador:
    // - Clase suelta (DROP_IN) vencida en enero 2020.
    await createMembership(mRenewDay8.id, 'DROP_IN', '2020-01-12', '2020-01-12', true);
    // - Membresía PENDING_PAYMENT (sin pagar) vencida en enero 2020, y renovación sin pagar.
    const mUnpaid = await createMember();
    await createMembership(mUnpaid.id, 'MONTHLY', '2019-12-20', '2020-01-18', false);
    await createMembership(mRenewDay8.id, 'MONTHLY', '2020-01-11', '2020-02-09', false);
    // - Clase suelta dentro de los 7 días de una vencida NO cuenta como renovación.
    const mDropInAfter = await createMember();
    await createMembership(mDropInAfter.id, 'MONTHLY', '2020-02-01', '2020-03-01', true);
    await createMembership(mDropInAfter.id, 'DROP_IN', '2020-03-03', '2020-03-03', true);
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('calcula total y desglose mensual excluyendo DROP_IN, sin duplicar, con tasa null en meses sin vencimientos', async () => {
    // Enero 2020 únicamente: 4 vencidas, 3 renovadas -> 75.0 (la segunda renovación de mRenewNextDay NO duplica la vencida de enero).
    const janOnly = await api()
      .get('/api/v1/reports/renewal-rate?from=2020-01-01&to=2020-01-31')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(janOnly.body.totals).toEqual({
      expiredCount: 4,
      renewedCount: 3,
      renewalRate: 75,
    });

    // Rango 2020-01-01..2020-03-31:
    //   2020-01: 4 vencidas, 3 renovadas -> 75
    //   2020-02: 5 vencidas (incluye las 2 de mRenewNextDay, la primera renovada por la segunda), 1 renovada -> 20
    //   2020-03: 1 vencida (mDropInAfter, cuya DROP_IN no cuenta como renovación) -> 0
    // Total: 10 vencidas, 4 renovadas -> 40
    const res = await api()
      .get('/api/v1/reports/renewal-rate?from=2020-01-01&to=2020-03-31')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.totals).toEqual({
      expiredCount: 10,
      renewedCount: 4,
      renewalRate: 40,
    });
    expect(res.body.months).toEqual([
      { month: '2020-01', expiredCount: 4, renewedCount: 3, renewalRate: 75 },
      { month: '2020-02', expiredCount: 5, renewedCount: 1, renewalRate: 20 },
      { month: '2020-03', expiredCount: 1, renewedCount: 0, renewalRate: 0 },
    ]);
    expect(res.body.message).toBeNull();

    // Rango que incluye un mes sin vencimientos (abril) junto con marzo: abril debe traer null, no 0.
    const withEmptyMonth = await api()
      .get('/api/v1/reports/renewal-rate?from=2020-03-01&to=2020-04-30')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(withEmptyMonth.body.months).toEqual([
      { month: '2020-03', expiredCount: 1, renewedCount: 0, renewalRate: 0 },
      { month: '2020-04', expiredCount: 0, renewedCount: 0, renewalRate: null },
    ]);
  });

  it('si todo el rango carece de vencimientos devuelve tasa null y mensaje claro', async () => {
    const res = await api()
      .get('/api/v1/reports/renewal-rate?from=2020-04-01&to=2020-05-31')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toEqual({
      from: '2020-04-01',
      to: '2020-05-31',
      totals: { expiredCount: 0, renewedCount: 0, renewalRate: null },
      months: [
        { month: '2020-04', expiredCount: 0, renewedCount: 0, renewalRate: null },
        { month: '2020-05', expiredCount: 0, renewedCount: 0, renewalRate: null },
      ],
      message: 'No hay membresías vencidas en ese rango.',
    });
  });

  it('rechaza inicio posterior al fin, fechas inválidas y rango mayor a 12 meses con 400', async () => {
    await api()
      .get('/api/v1/reports/renewal-rate?from=2020-03-31&to=2020-01-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await api()
      .get('/api/v1/reports/renewal-rate?from=2020-02-30&to=2020-03-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await api()
      .get('/api/v1/reports/renewal-rate?from=2020-01-01&to=2021-01-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('solo ADMIN puede consultarlo (MEMBER, TRAINER y RECEPTION reciben 403; sin token 401)', async () => {
    for (const token of [memberToken, trainerToken, receptionToken]) {
      await api()
        .get('/api/v1/reports/renewal-rate?from=2020-01-01&to=2020-03-31')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }
    await api()
      .get('/api/v1/reports/renewal-rate?from=2020-01-01&to=2020-03-31')
      .expect(401);
  });
});
