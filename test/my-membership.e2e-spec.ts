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
 * El estado de membresía lo calcula H04 (BE-4.3), que aún no existe: aquí se
 * registra un MEMBERSHIP_STATUS_SERVICE de prueba para comprobar lo que H05
 * hace con cada estado. Sin él, el endpoint debe responder 503.
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

async function createApp(withStatusService: boolean) {
  const moduleRef = await Test.createTestingModule({
    imports: withStatusService
      ? [AppModule, FakeMembershipStatusModule]
      : [AppModule],
  }).compile();

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

describe('Mi membresía · H05 sin el servicio de H04 (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp(false);
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 503 con un mensaje claro en vez de inventar un estado', async () => {
    const token = await login(app, ACTIVE_EMAIL);
    const res = await request(app.getHttpServer())
      .get('/api/v1/memberships/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(503);
    expect(res.body.message).toBe(
      'La consulta de membresías todavía no está disponible.',
    );
  });
});
