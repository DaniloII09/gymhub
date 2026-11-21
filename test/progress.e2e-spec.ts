import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { gymToday } from '@Routines/services';

/**
 * Prueba de integración de H19 (progreso y evolución corporal) contra PostgreSQL real.
 *
 * Crea sus propios miembros (e2e.h19.*) y los limpia junto con sus registros
 * de progreso al terminar.
 */
const PASSWORD = 'Demo1234!';
const EMAIL_PREFIX = 'e2e.h19.';

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('Progreso corporal · H19 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let trainerToken: string;
  let adminToken: string;
  let receptionToken: string;

  const api = () => request(app.getHttpServer());

  const login = async (email: string) => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  async function createMember() {
    const passwordHash = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@gymhub.test' } })
    ).passwordHash;
    const email = `${EMAIL_PREFIX}${randomUUID()}@gymhub.test`;
    const member = await prisma.user.create({
      data: {
        email,
        fullName: `Miembro H19 ${randomUUID().slice(0, 6)}`,
        role: 'MEMBER',
        memberCode: `GYM-5${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
        passwordHash,
      },
    });
    const token = await login(email);
    return { member, token };
  }

  async function cleanUp() {
    await prisma.progressEntry.deleteMany({
      where: { member: { email: { startsWith: EMAIL_PREFIX } } },
    });
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

    trainerToken = await login('entrenador@gymhub.test');
    adminToken = await login('admin@gymhub.test');
    receptionToken = await login('recepcion@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('DB-19.1: rechaza rangos inválidos y duplicado por (member_id, recorded_at) en PostgreSQL', async () => {
    const { member } = await createMember();
    const date = new Date('2026-11-10T00:00:00.000Z');

    await expect(
      prisma.progressEntry.create({
        data: { memberId: member.id, recordedAt: date, weightKg: 19, chestCm: 90, waistCm: 80, armCm: 30 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.progressEntry.create({
        data: { memberId: member.id, recordedAt: date, weightKg: 70, chestCm: 251, waistCm: 80, armCm: 30 },
      }),
    ).rejects.toThrow();

    await prisma.progressEntry.create({
      data: { memberId: member.id, recordedAt: date, weightKg: 76, chestCm: 98, waistCm: 84, armCm: 34 },
    });
    await expect(
      prisma.progressEntry.create({
        data: { memberId: member.id, recordedAt: date, weightKg: 75, chestCm: 98, waistCm: 84, armCm: 34 },
      }),
    ).rejects.toThrow();
  });

  it('registra progreso, marca isBaseline, calcula evolución (-3.5 kg y 0 con un registro) y rechaza duplicado con 409', async () => {
    const { member, token } = await createMember();
    const today = gymToday();
    const earlier = addDaysIso(today, -14);

    // Primer registro -> isBaseline: true; con un solo registro las diferencias son 0.
    const first = await api()
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: earlier,
        weightKg: 76.0,
        chestCm: 98.0,
        waistCm: 84.0,
        armCm: 34.0,
      })
      .expect(201);

    expect(first.body).toMatchObject({
      date: earlier,
      weightKg: 76.0,
      isBaseline: true,
    });

    const singleEvolution = await api()
      .get('/api/v1/progress/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(singleEvolution.body.entries).toHaveLength(1);
    expect(singleEvolution.body.entries[0].isBaseline).toBe(true);
    expect(singleEvolution.body.deltas).toEqual({
      weightKg: 0,
      chestCm: 0,
      waistCm: 0,
      armCm: 0,
    });

    // Segundo registro en la misma fecha -> 409 con mensaje exacto.
    const dup = await api()
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: earlier,
        weightKg: 75.5,
        chestCm: 98.0,
        waistCm: 83.5,
        armCm: 34.0,
      })
      .expect(409);
    expect(dup.body.message).toBe('Ya tienes un registro en esa fecha.');

    // Segundo registro en hoy (72.5 kg) -> isBaseline: false, evolución -3.5 kg.
    const second = await api()
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: today,
        weightKg: 72.5,
        chestCm: 99.5,
        waistCm: 80.5,
        armCm: 34.5,
      })
      .expect(201);
    expect(second.body.isBaseline).toBe(false);

    const evolution = await api()
      .get('/api/v1/progress/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(evolution.body.entries).toHaveLength(2);
    expect(evolution.body.entries[0]).toMatchObject({ date: earlier, isBaseline: true });
    expect(evolution.body.entries[1]).toMatchObject({ date: today, isBaseline: false });
    expect(evolution.body.deltas).toEqual({
      weightKg: -3.5,
      chestCm: 1.5,
      waistCm: -3.5,
      armCm: 0.5,
    });

    // Rechaza fecha futura y valores fuera de rango sin guardar parciales.
    const beforeInvalid = await prisma.progressEntry.count({ where: { memberId: member.id } });
    await api()
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: addDaysIso(today, 1),
        weightKg: 72,
        chestCm: 99,
        waistCm: 80,
        armCm: 34,
      })
      .expect(400);
    await api()
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: addDaysIso(today, -1),
        weightKg: 350,
        chestCm: 99,
        waistCm: 80,
        armCm: 34,
      })
      .expect(400);
    await api()
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: addDaysIso(today, -1),
        weightKg: 72,
        chestCm: 5,
        waistCm: 80,
        armCm: 34,
      })
      .expect(400);

    await expect(
      prisma.progressEntry.count({ where: { memberId: member.id } }),
    ).resolves.toBe(beforeInvalid);
  });

  it('aislamiento por token: otro miembro no puede consultar ni modificar el progreso ajeno', async () => {
    const owner = await createMember();
    const intruder = await createMember();
    const today = gymToday();

    const created = await api()
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ date: today, weightKg: 76, chestCm: 98, waistCm: 84, armCm: 34 })
      .expect(201);

    // El intruso ve su propia evolución vacía, nunca la del dueño.
    const intruderEvolution = await api()
      .get('/api/v1/progress/me')
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(200);
    expect(intruderEvolution.body).toEqual({ entries: [], deltas: null });

    // El intruso no puede modificar el registro ajeno (404).
    await api()
      .patch(`/api/v1/progress/${created.body.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ weightKg: 60 })
      .expect(404);

    // Tampoco acepta memberId suplantado en el body (400 forbidNonWhitelisted).
    await api()
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({
        memberId: owner.member.id,
        date: today,
        weightKg: 70,
        chestCm: 95,
        waistCm: 80,
        armCm: 33,
      })
      .expect(400);

    // Roles distintos de MEMBER -> 403; sin token -> 401.
    for (const token of [adminToken, receptionToken, trainerToken]) {
      await api().get('/api/v1/progress/me').set('Authorization', `Bearer ${token}`).expect(403);
      await api()
        .post('/api/v1/progress')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: today, weightKg: 70, chestCm: 95, waistCm: 80, armCm: 33 })
        .expect(403);
    }
    await api().get('/api/v1/progress/me').expect(401);
  });
});
