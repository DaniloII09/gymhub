import 'dotenv/config';
import { readFileSync } from 'node:fs';
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
  MEMBERSHIP_EXPIRY_SOURCE,
  type ExpiringMembership,
  type MembershipExpirySource,
} from '@Common/contracts';
import {
  EXPIRY_NOTICE_TITLE,
  addDays,
  gymToday,
} from '@Notifications/services';

/**
 * Prueba de integración de H26 contra la base de datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido.
 * Las membresías son de H04, que aún no existe: aquí se registra un
 * MEMBERSHIP_EXPIRY_SOURCE de prueba con ids altos (99000x) para no chocar con
 * datos reales. Los avisos y registros que crea se borran al terminar.
 */
const PASSWORD = 'Demo1234!';
const MIGRATION = '20261118050000_add_expiry_notices';
const IDS = { d5: 990001, d1: 990002, renewed: 990003, dropIn: 990004 };
const REFERENCES = Object.values(IDS).map((id) => `membership:${id}`);

const members: Record<string, string> = {};
const today = gymToday();

const fakeSource: MembershipExpirySource = {
  expiringOn: (endDate: string) => {
    const at = new Date(`${endDate}T00:00:00.000Z`);
    const list: ExpiringMembership[] = [];
    if (endDate === addDays(today, 5)) {
      list.push(
        {
          membershipId: IDS.d5,
          memberId: members.ana,
          planName: 'Mensual',
          planType: 'MONTHLY',
          endDate: at,
          renewed: false,
        },
        {
          membershipId: IDS.renewed,
          memberId: members.luis,
          planName: 'Mensual',
          planType: 'MONTHLY',
          endDate: at,
          renewed: true,
        },
      );
    }
    if (endDate === addDays(today, 1)) {
      list.push(
        {
          membershipId: IDS.d1,
          memberId: members.miembro,
          planName: 'Trimestral',
          planType: 'QUARTERLY',
          endDate: at,
          renewed: false,
        },
        {
          membershipId: IDS.dropIn,
          memberId: members.luis,
          planName: 'Clase suelta',
          planType: 'DROP_IN',
          endDate: at,
          renewed: false,
        },
      );
    }
    return Promise.resolve(list);
  },
};

/** Lo que H04 registrará en MembershipsModule; aquí, solo para la prueba. */
@Global()
@Module({
  providers: [{ provide: MEMBERSHIP_EXPIRY_SOURCE, useValue: fakeSource }],
  exports: [MEMBERSHIP_EXPIRY_SOURCE],
})
class FakeMembershipExpiryModule {}

/** Separa un .sql de Prisma en sentencias, sin comentarios. */
function statements(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

describe('Avisos de vencimiento · H26 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let memberToken: string;

  const login = async (email: string, password = PASSWORD) =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200)
    ).body.accessToken as string;

  const cleanUp = async () => {
    await prisma.notification.deleteMany({
      where: { referenceId: { in: REFERENCES } },
    });
    await prisma.expiryNotice.deleteMany({
      where: { membershipId: { in: Object.values(IDS) } },
    });
  };

  const run = () =>
    request(app.getHttpServer())
      .post('/api/v1/notifications/expiry-notices/run')
      .set('Authorization', `Bearer ${adminToken}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, FakeMembershipExpiryModule],
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
    for (const [key, email] of [
      ['miembro', 'miembro@gymhub.test'],
      ['ana', 'ana.gomez@gymhub.test'],
      ['luis', 'luis.martinez@gymhub.test'],
    ]) {
      members[key] = (
        await prisma.user.findUniqueOrThrow({ where: { email } })
      ).id;
    }
    await cleanUp();

    // Desde H02 la contraseña del admin sale del .env (SEED_ADMIN_PASSWORD).
    adminToken = await login(
      'admin@gymhub.test',
      process.env.SEED_ADMIN_PASSWORD ?? PASSWORD,
    );
    memberToken = await login('miembro@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('Criterios 1, 2 y 5: avisa 5 días antes y un día antes, sin repetir si corre dos veces', async () => {
    const first = await run().expect(200);
    expect(first.body).toEqual({
      date: today,
      sent: { D5: 1, D1: 1 },
      sourceAvailable: true,
    });

    const second = await run().expect(200);
    expect(second.body.sent).toEqual({ D5: 0, D1: 0 });

    const d5 = await prisma.notification.findMany({
      where: { referenceId: `membership:${IDS.d5}` },
    });
    expect(d5).toHaveLength(1);
    expect(d5[0]).toMatchObject({
      userId: members.ana,
      title: EXPIRY_NOTICE_TITLE,
      source: 'MEMBERSHIPS',
    });
    expect(d5[0].message).toContain('vence en 5 días');

    const d1 = await prisma.notification.findMany({
      where: { referenceId: `membership:${IDS.d1}` },
    });
    expect(d1).toHaveLength(1);
    expect(d1[0].title).toBe(EXPIRY_NOTICE_TITLE);
    expect(d1[0].message).toContain('vence mañana');
  });

  it('Criterios 3 y 4: no avisa a quien ya renovó ni por la clase suelta', async () => {
    await run().expect(200);
    const count = await prisma.notification.count({
      where: {
        referenceId: {
          in: [`membership:${IDS.renewed}`, `membership:${IDS.dropIn}`],
        },
      },
    });
    expect(count).toBe(0);
  });

  it('DB-26.1: la base rechaza dos avisos D5 para la misma membresía', async () => {
    const data = {
      membershipId: IDS.d5,
      memberId: members.ana,
      kind: 'D5' as const,
      endDate: new Date(`${addDays(today, 5)}T00:00:00.000Z`),
    };
    // El D5 de IDS.d5 ya existe por la primera prueba; se asegura por si corre sola.
    await prisma.expiryNotice.createMany({ data, skipDuplicates: true });
    await expect(prisma.expiryNotice.create({ data })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('DB-26.1: la migración se revierte y se vuelve a aplicar sin errores', async () => {
    const dir = `prisma/migrations/${MIGRATION}`;
    const rollback = new Error('rollback de prueba');
    // Todo dentro de una transacción que se revierte: la base queda igual.
    await expect(
      prisma.$transaction(async (tx) => {
        for (const sql of statements(`${dir}/down.sql`)) {
          await tx.$executeRawUnsafe(sql);
        }
        const [{ exists }] = await tx.$queryRawUnsafe<{ exists: boolean }[]>(
          `SELECT to_regclass('public.expiry_notices') IS NOT NULL AS "exists"`,
        );
        expect(exists).toBe(false);
        for (const sql of statements(`${dir}/migration.sql`)) {
          await tx.$executeRawUnsafe(sql);
        }
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    // Tras el rollback la tabla sigue ahí: si no, count() lanzaría.
    await expect(prisma.expiryNotice.count()).resolves.toBeGreaterThan(0);
  });

  it('solo el administrador puede correr la tarea a mano', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/notifications/expiry-notices/run')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });
});
