import 'dotenv/config';
import { Test } from '@nestjs/testing';
import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import {
  MEMBERSHIP_STATUS_SERVICE,
  type CurrentMembership,
  type MembershipStatusService,
} from '@Common/contracts';

/**
 * Prueba de integración de H05 ("Mi membresía") contra la base de datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido.
 * El estado de membresía lo calcula H04 (BE-4.3). La primera suite reemplaza
 * MEMBERSHIP_STATUS_SERVICE por uno de prueba para comprobar lo que H05 hace
 * con cada estado; la segunda usa el servicio real contra la base.
 */
const PASSWORD = 'Demo1234!';
const ACTIVE_EMAIL = 'miembro@gymhub.test';
const NONE_EMAIL = 'ana.gomez@gymhub.test';
const DROP_IN_EMAIL = 'luis.martinez@gymhub.test';
const CLASS_STARTS_AT = new Date('2026-11-18T13:00:00.000Z');

const byMemberId = new Map<string, CurrentMembership>();

const fakeStatusService: MembershipStatusService = {
  currentFor: (memberId: string) =>
    Promise.resolve(
      byMemberId.get(memberId) ?? {
        status: 'NONE',
        planName: null,
        planType: null,
        endDate: null,
        daysLeft: null,
      },
    ),
};

/** Lo que H04 registrará en MembershipsModule; aquí, solo para la prueba. */
@Global()
@Module({
  providers: [
    { provide: MEMBERSHIP_STATUS_SERVICE, useValue: fakeStatusService },
  ],
  exports: [MEMBERSHIP_STATUS_SERVICE],
})
class FakeMembershipStatusModule {}

async function createApp(withFakeStatusService: boolean) {
  const builder = Test.createTestingModule({
    imports: withFakeStatusService
      ? [AppModule, FakeMembershipStatusModule]
      : [AppModule],
  });
  // H04 ya registra el servicio real en MembershipsModule: se reemplaza para
  // que ModuleRef encuentre siempre el de prueba.
  const moduleRef = await (withFakeStatusService
    ? builder.overrideProvider(MEMBERSHIP_STATUS_SERVICE).useValue(fakeStatusService)
    : builder
  ).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
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
  return app;
}

async function login(
  app: INestApplication<App>,
  email: string,
  password = PASSWORD,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.accessToken as string;
}

describe('Mi membresía · H05 (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp(true);
    const prisma = app.get(PrismaService);
    const idOf = async (email: string) =>
      (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

    byMemberId.set(await idOf(ACTIVE_EMAIL), {
      status: 'ACTIVE',
      planName: 'Mensual',
      planType: 'MONTHLY',
      endDate: new Date('2026-12-15T06:00:00.000Z'),
      daysLeft: 27,
    });
    byMemberId.set(await idOf(DROP_IN_EMAIL), {
      status: 'ACTIVE',
      planName: 'Clase suelta',
      planType: 'DROP_IN',
      endDate: new Date('2026-11-18T06:00:00.000Z'),
      daysLeft: 0,
      includedClass: { name: 'Spinning Matutino', startsAt: CLASS_STARTS_AT },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const me = (token?: string) => {
    const req = request(app.getHttpServer()).get('/api/v1/memberships/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('Criterio 1: el miembro ve su plan, estado, vencimiento y días restantes', async () => {
    const token = await login(app, ACTIVE_EMAIL);
    const res = await me(token).expect(200);
    expect(res.body).toEqual({
      status: 'ACTIVE',
      planName: 'Mensual',
      planType: 'MONTHLY',
      endDate: '2026-12-15',
      daysLeft: 27,
      includedClass: null,
    });
  });

  it('Criterio 3: quien nunca tuvo membresía recibe NONE, sin error', async () => {
    const token = await login(app, NONE_EMAIL);
    const res = await me(token).expect(200);
    expect(res.body).toEqual({
      status: 'NONE',
      planName: null,
      planType: null,
      endDate: null,
      daysLeft: null,
      includedClass: null,
    });
  });

  it('Criterio 4: la clase suelta trae la clase incluida y vence hoy', async () => {
    const token = await login(app, DROP_IN_EMAIL);
    const res = await me(token).expect(200);
    expect(res.body).toMatchObject({
      planType: 'DROP_IN',
      daysLeft: 0,
      includedClass: {
        name: 'Spinning Matutino',
        startsAt: CLASS_STARTS_AT.toISOString(),
      },
    });
  });

  it('Criterio 5: un entrenador recibe 403 y sin token 401', async () => {
    const trainerToken = await login(
      app,
      'entrenador@gymhub.test',
      process.env.SEED_STAFF_PASSWORD ?? PASSWORD,
    );
    await me(trainerToken).expect(403);
    await me().expect(401);
  });

  it('cada miembro solo ve la suya: la ruta no acepta otro miembro', async () => {
    const token = await login(app, NONE_EMAIL);
    await request(app.getHttpServer())
      .get('/api/v1/memberships/someone-else')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

describe('Mi membresía · H05 con el estado real de H04 (e2e)', () => {
  const EMAIL_PREFIX = 'e2e.h05.real.';
  let app: INestApplication<App>;
  let prisma: PrismaService;

  /** Miembro nuevo, sin membresías; se borra al terminar. */
  async function createMember(): Promise<{ id: string; email: string }> {
    const email = `${EMAIL_PREFIX}${Date.now()}.${Math.random().toString(36).slice(2, 8)}@gymhub.test`;
    const passwordHash = (await prisma.user.findUniqueOrThrow({ where: { email: ACTIVE_EMAIL } }))
      .passwordHash;
    const user = await prisma.user.create({
      data: { email, fullName: 'Miembro H05', role: 'MEMBER', passwordHash },
    });
    return { id: user.id, email };
  }

  const gymToday = () =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/El_Salvador',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  const dbDate = (iso: string, plusDays = 0) => {
    const d = new Date(`${iso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + plusDays);
    return d;
  };

  beforeAll(async () => {
    app = await createApp(false);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const where = { member: { email: { startsWith: EMAIL_PREFIX } } };
    await prisma.charge.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
    await app.close();
  });

  it('quien nunca tuvo membresía recibe NONE', async () => {
    const member = await createMember();
    const res = await request(app.getHttpServer())
      .get('/api/v1/memberships/me')
      .set('Authorization', `Bearer ${await login(app, member.email)}`)
      .expect(200);
    expect(res.body).toMatchObject({ status: 'NONE', planName: null, endDate: null });
  });

  it('una Mensual pagada que inicia hoy se ve ACTIVE, vence en 29 días y la fecha no se corre de día', async () => {
    const member = await createMember();
    const today = gymToday();
    const plan = await prisma.plan.findUniqueOrThrow({ where: { name: 'Mensual' } });
    const membership = await prisma.membership.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        planType: 'MONTHLY',
        startDate: dbDate(today),
        endDate: dbDate(today, 29),
        createdById: member.id,
      },
    });
    await prisma.charge.create({
      data: {
        memberId: member.id,
        type: 'MEMBERSHIP',
        concept: 'Membresía Mensual',
        amount: plan.price,
        dueDate: dbDate(today),
        membershipId: membership.id,
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/memberships/me')
      .set('Authorization', `Bearer ${await login(app, member.email)}`)
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'ACTIVE',
      planName: 'Mensual',
      planType: 'MONTHLY',
      endDate: dbDate(today, 29).toISOString().slice(0, 10),
      daysLeft: 29,
    });
  });
});
