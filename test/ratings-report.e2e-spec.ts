import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '@Prisma/services';

/**
 * Prueba de integración de H23 (reporte de promedios de calificaciones) contra
 * PostgreSQL real.
 *
 * Crea sus propios entrenadores, miembros, clases, sesiones y reseñas en 2020
 * (rango aislado del seed y de otros tests) y los limpia al terminar.
 */
const PASSWORD = 'Demo1234!';
const EMAIL_PREFIX = 'e2e.h23.';
const CLASS_PREFIX = '[e2e H23]';

describe('Reportes · H23 promedios de calificación (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let memberToken: string;
  let trainerToken: string;
  let receptionToken: string;

  const api = () => request(app.getHttpServer());

  const login = async (email: string) => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  async function createUser(
    role: 'MEMBER' | 'TRAINER',
    fullName: string,
    extra: { memberCode?: string } = {},
  ) {
    const passwordHash = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@gymhub.test' } })
    ).passwordHash;
    return prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}${randomUUID()}@gymhub.test`,
        fullName,
        role,
        passwordHash,
        ...extra,
      },
    });
  }

  async function cleanUp() {
    const ofTestUsers = { member: { email: { startsWith: EMAIL_PREFIX } } };
    const ofTestClasses = { gymClass: { name: { startsWith: CLASS_PREFIX } } };
    await prisma.review.deleteMany({ where: { OR: [ofTestUsers, ofTestClasses] } });
    await prisma.personalSession.deleteMany({
      where: {
        OR: [
          { member: { email: { startsWith: EMAIL_PREFIX } } },
          { trainer: { email: { startsWith: EMAIL_PREFIX } } },
        ],
      },
    });
    await prisma.gymClass.deleteMany({ where: { name: { startsWith: CLASS_PREFIX } } });
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

    const m1 = await createUser('MEMBER', 'Miembro Uno H23', {
      memberCode: `GYM-7${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    });
    const m2 = await createUser('MEMBER', 'Miembro Dos H23', {
      memberCode: `GYM-7${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    });
    const m3 = await createUser('MEMBER', 'Miembro Tres H23', {
      memberCode: `GYM-7${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    });

    // Entrenadores para probar 4, 5, 4 -> 4.3 (clases + sesiones) y empate de 4.0 ordenado por nombre.
    const trainerA = await createUser('TRAINER', 'Ana H23');
    const trainerZ = await createUser('TRAINER', 'Zoe H23');
    const trainerMix = await createUser('TRAINER', 'Marcos H23');

    const cMix1 = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Spinning`,
        trainerId: trainerMix.id,
        startsAt: new Date('2020-03-05T15:00:00Z'),
        endsAt: new Date('2020-03-05T16:00:00Z'),
        capacity: 20,
      },
    });
    const cMix2 = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Spinning`,
        trainerId: trainerMix.id,
        startsAt: new Date('2020-03-10T15:00:00Z'),
        endsAt: new Date('2020-03-10T16:00:00Z'),
        capacity: 20,
      },
    });
    const psMix = await prisma.personalSession.create({
      data: {
        trainerId: trainerMix.id,
        memberId: m1.id,
        startsAt: new Date('2020-03-12T15:00:00Z'),
        endsAt: new Date('2020-03-12T16:00:00Z'),
        status: 'COMPLETED',
        outcome: 'COMPLETED',
        resultRecordedAt: new Date('2020-03-12T16:00:00Z'),
      },
    });

    // Marcos H23: 4 + 5 (clases) + 4 (sesión personal) -> promedio 4.3, count 3.
    await prisma.review.create({
      data: {
        memberId: m1.id,
        gymClassId: cMix1.id,
        rating: 4,
        createdAt: new Date('2020-03-06T18:00:00Z'),
      },
    });
    await prisma.review.create({
      data: {
        memberId: m2.id,
        gymClassId: cMix2.id,
        rating: 5,
        createdAt: new Date('2020-03-11T18:00:00Z'),
      },
    });
    await prisma.review.create({
      data: {
        memberId: m1.id,
        personalSessionId: psMix.id,
        rating: 4,
        // 31/03 21:00 El Salvador = 01/04 03:00 UTC: debe entrar en marzo.
        createdAt: new Date('2020-04-01T03:00:00Z'),
      },
    });

    // Empate 4.0 entre Ana H23 y Zoe H23 (y clases Alfa H23 vs Beta H23 con 4.0).
    const cBeta = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Beta`,
        trainerId: trainerZ.id,
        startsAt: new Date('2020-03-08T15:00:00Z'),
        endsAt: new Date('2020-03-08T16:00:00Z'),
        capacity: 15,
      },
    });
    const cAlfa = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Alfa`,
        trainerId: trainerA.id,
        startsAt: new Date('2020-03-09T15:00:00Z'),
        endsAt: new Date('2020-03-09T16:00:00Z'),
        capacity: 15,
      },
    });
    await prisma.review.create({
      data: {
        memberId: m1.id,
        gymClassId: cBeta.id,
        rating: 4,
        createdAt: new Date('2020-03-09T18:00:00Z'),
      },
    });
    await prisma.review.create({
      data: {
        memberId: m3.id,
        gymClassId: cAlfa.id,
        rating: 4,
        createdAt: new Date('2020-03-10T18:00:00Z'),
      },
    });

    // Reseña fuera de marzo (31/12/2019 22:00 El Salvador = 01/01/2020 04:00 UTC) -> no entra en 2020.
    const cOutside = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Fuera`,
        trainerId: trainerA.id,
        startsAt: new Date('2019-12-30T15:00:00Z'),
        endsAt: new Date('2019-12-30T16:00:00Z'),
        capacity: 15,
      },
    });
    await prisma.review.create({
      data: {
        memberId: m2.id,
        gymClassId: cOutside.id,
        rating: 1,
        createdAt: new Date('2020-01-01T04:00:00Z'),
      },
    });
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('agrupa por entrenador (clases+sesiones) y por clase, calcula 4.3 (count 3) y ordena empates de 4.0 por nombre', async () => {
    const res = await api()
      .get('/api/v1/reports/ratings?from=2020-03-01&to=2020-03-31')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.from).toBe('2020-03-01');
    expect(res.body.to).toBe('2020-03-31');
    expect(res.body.message).toBeNull();

    expect(res.body.byTrainer).toEqual([
      expect.objectContaining({ trainerName: 'Ana H23', averageRating: 4, reviewCount: 1 }),
      expect.objectContaining({ trainerName: 'Zoe H23', averageRating: 4, reviewCount: 1 }),
      expect.objectContaining({ trainerName: 'Marcos H23', averageRating: 4.3, reviewCount: 3 }),
    ]);

    expect(res.body.byClassName).toEqual([
      { className: `${CLASS_PREFIX} Alfa`, averageRating: 4, reviewCount: 1 },
      { className: `${CLASS_PREFIX} Beta`, averageRating: 4, reviewCount: 1 },
      { className: `${CLASS_PREFIX} Spinning`, averageRating: 4.5, reviewCount: 2 },
    ]);
  });

  it('respeta límites de fecha local (El Salvador) inclusivos y sin reseñas devuelve mensaje claro', async () => {
    // 2020-03-31 incluye la reseña creada a las 21:00 SV (01/04 03:00 UTC).
    const boundary = await api()
      .get('/api/v1/reports/ratings?from=2020-03-31&to=2020-03-31')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(boundary.body.byTrainer).toEqual([
      expect.objectContaining({ trainerName: 'Marcos H23', averageRating: 4, reviewCount: 1 }),
    ]);
    expect(boundary.body.byClassName).toEqual([]);
    expect(boundary.body.message).toBeNull();

    // Rango sin reseñas -> "No hay reseñas en ese rango."
    const empty = await api()
      .get('/api/v1/reports/ratings?from=2020-02-01&to=2020-02-29')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(empty.body).toEqual({
      from: '2020-02-01',
      to: '2020-02-29',
      byTrainer: [],
      byClassName: [],
      message: 'No hay reseñas en ese rango.',
    });
  });

  it('rechaza rangos inválidos o > 12 meses con 400', async () => {
    await api()
      .get('/api/v1/reports/ratings?from=2020-03-31&to=2020-03-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await api()
      .get('/api/v1/reports/ratings?from=2020-01-01&to=2021-01-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await api()
      .get('/api/v1/reports/ratings?from=2021-02-29&to=2021-03-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('solo ADMIN puede consultarlo (MEMBER, TRAINER y RECEPTION reciben 403; sin token 401)', async () => {
    for (const token of [memberToken, trainerToken, receptionToken]) {
      await api()
        .get('/api/v1/reports/ratings?from=2020-03-01&to=2020-03-31')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }
    await api()
      .get('/api/v1/reports/ratings?from=2020-03-01&to=2020-03-31')
      .expect(401);
  });
});
