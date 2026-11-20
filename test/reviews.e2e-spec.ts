import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { addGymDays, gymDateString } from '@Reviews/services';

/**
 * Prueba de integración de H22 (reseñas de clases grupales y sesiones personales)
 * contra PostgreSQL real.
 *
 * Crea sus propios miembros (e2e.h22.*), clases ([e2e H22]*) y sesiones/check-ins
 * asociados, y los limpia al terminar.
 */
const PASSWORD = 'Demo1234!';
const EMAIL_PREFIX = 'e2e.h22.';
const CLASS_PREFIX = '[e2e H22]';

describe('Reseñas · H22 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let receptionId: string;
  let trainerId: string;
  let adminToken: string;
  let receptionToken: string;
  let trainerToken: string;

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
        fullName: `Miembro H22 ${randomUUID().slice(0, 6)}`,
        role: 'MEMBER',
        memberCode: `GYM-8${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
        passwordHash,
      },
    });
    const token = await login(email);
    return { member, token };
  }

  function gymInstant(daysOffset: number, hour: number, minute = 0): Date {
    const today = gymDateString(new Date());
    const date = addGymDays(today, daysOffset);
    return new Date(
      `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000-06:00`,
    );
  }

  async function createClass(
    startsAt: Date,
    endsAt: Date,
    status: 'SCHEDULED' | 'CANCELLED' = 'SCHEDULED',
  ) {
    return prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} ${randomUUID().slice(0, 8)}`,
        trainerId,
        startsAt,
        endsAt,
        capacity: 15,
        status,
      },
    });
  }

  async function createSession(
    memberId: string,
    startsAt: Date,
    endsAt: Date,
    opts: {
      status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
      outcome?: 'COMPLETED' | 'NO_SHOW' | null;
    } = {},
  ) {
    const status = opts.status ?? 'COMPLETED';
    const outcome = opts.outcome === undefined ? 'COMPLETED' : opts.outcome;
    return prisma.personalSession.create({
      data: {
        trainerId,
        memberId,
        startsAt,
        endsAt,
        status,
        outcome,
        resultRecordedAt: status === 'COMPLETED' ? endsAt : null,
      },
    });
  }

  async function cleanUp() {
    const ofMembers = { member: { email: { startsWith: EMAIL_PREFIX } } };
    const ofClasses = { gymClass: { name: { startsWith: CLASS_PREFIX } } };
    await prisma.review.deleteMany({ where: { OR: [ofMembers, ofClasses] } });
    await prisma.classReservation.deleteMany({ where: { OR: [ofMembers, ofClasses] } });
    await prisma.checkIn.deleteMany({ where: ofMembers });
    await prisma.personalSession.deleteMany({ where: ofMembers });
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

    receptionId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@gymhub.test' } })
    ).id;
    trainerId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'entrenador@gymhub.test' } })
    ).id;
    adminToken = await login('admin@gymhub.test');
    receptionToken = await login('recepcion@gymhub.test');
    trainerToken = await login('entrenador@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('DB-22.1: rechaza estrellas fuera de 1..5, destino ambiguo/nulo y reseñas duplicadas', async () => {
    const { member } = await createMember();
    const gc = await createClass(gymInstant(-2, 10), gymInstant(-2, 11));
    const ps = await createSession(member.id, gymInstant(-2, 14), gymInstant(-2, 15));

    await expect(
      prisma.review.create({ data: { memberId: member.id, gymClassId: gc.id, rating: 0 } }),
    ).rejects.toThrow();
    await expect(
      prisma.review.create({ data: { memberId: member.id, gymClassId: gc.id, rating: 6 } }),
    ).rejects.toThrow();
    await expect(
      prisma.review.create({
        data: { memberId: member.id, gymClassId: gc.id, personalSessionId: ps.id, rating: 5 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.review.create({ data: { memberId: member.id, rating: 5 } }),
    ).rejects.toThrow();

    await prisma.review.create({ data: { memberId: member.id, gymClassId: gc.id, rating: 5 } });
    await expect(
      prisma.review.create({ data: { memberId: member.id, gymClassId: gc.id, rating: 4 } }),
    ).rejects.toThrow();

    await prisma.review.create({
      data: { memberId: member.id, personalSessionId: ps.id, rating: 4 },
    });
    await expect(
      prisma.review.create({
        data: { memberId: member.id, personalSessionId: ps.id, rating: 3 },
      }),
    ).rejects.toThrow();
  });

  it('GET /reviews/pending lista solo elegibles dentro de 7 días y desaparecen al calificar', async () => {
    const { member, token } = await createMember();
    const other = await createMember();

    // 1. Clase elegible (hace 2 días, noche local = día siguiente UTC, check-in ese mismo día antes de endsAt).
    const eligibleClass = await createClass(gymInstant(-2, 20), gymInstant(-2, 21));
    await prisma.classReservation.create({
      data: { classId: eligibleClass.id, memberId: member.id, status: 'CONFIRMED' },
    });
    await prisma.checkIn.create({
      data: {
        memberId: member.id,
        checkedInAt: gymInstant(-2, 19, 30),
        membershipStatus: 'ACTIVE',
        registeredById: receptionId,
      },
    });

    // 2. Clase con reserva pero sin ingreso ese día (solo check-in de ayer).
    const noCheckInClass = await createClass(gymInstant(-3, 10), gymInstant(-3, 11));
    await prisma.classReservation.create({
      data: { classId: noCheckInClass.id, memberId: member.id, status: 'CONFIRMED' },
    });

    // 3. Clase con check-in del mismo día DESPUÉS de que terminó.
    const lateCheckInClass = await createClass(gymInstant(-4, 8), gymInstant(-4, 9));
    await prisma.classReservation.create({
      data: { classId: lateCheckInClass.id, memberId: member.id, status: 'CONFIRMED' },
    });
    await prisma.checkIn.create({
      data: {
        memberId: member.id,
        checkedInAt: gymInstant(-4, 9, 1),
        membershipStatus: 'ACTIVE',
        registeredById: receptionId,
      },
    });

    // 4. Clase hace 7 días (en el límite permitido).
    const day7Class = await createClass(gymInstant(-7, 1), gymInstant(-7, 2));
    await prisma.classReservation.create({
      data: { classId: day7Class.id, memberId: member.id, status: 'CONFIRMED' },
    });
    await prisma.checkIn.create({
      data: {
        memberId: member.id,
        checkedInAt: gymInstant(-7, 0, 30),
        membershipStatus: 'ACTIVE',
        registeredById: receptionId,
      },
    });

    // 5. Clase hace 8 días (fuera de ventana).
    const expiredClass = await createClass(gymInstant(-8, 22), gymInstant(-8, 23));
    await prisma.classReservation.create({
      data: { classId: expiredClass.id, memberId: member.id, status: 'CONFIRMED' },
    });
    await prisma.checkIn.create({
      data: {
        memberId: member.id,
        checkedInAt: gymInstant(-8, 21, 30),
        membershipStatus: 'ACTIVE',
        registeredById: receptionId,
      },
    });

    // 6. Sesiones: una COMPLETED/COMPLETED válida, una NO_SHOW, una SCHEDULED, y una ajena.
    const eligibleSession = await createSession(member.id, gymInstant(-1, 14), gymInstant(-1, 15), {
      status: 'COMPLETED',
      outcome: 'COMPLETED',
    });
    await createSession(member.id, gymInstant(-1, 16), gymInstant(-1, 17), {
      status: 'COMPLETED',
      outcome: 'NO_SHOW',
    });
    await createSession(member.id, gymInstant(-1, 18), gymInstant(-1, 19), {
      status: 'SCHEDULED',
      outcome: null,
    });
    await createSession(other.member.id, gymInstant(-1, 10), gymInstant(-1, 11), {
      status: 'COMPLETED',
      outcome: 'COMPLETED',
    });

    const pendingRes = await api()
      .get('/api/v1/reviews/pending')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const targets = (pendingRes.body.data as Array<{ targetType: string; targetId: number }>).map(
      (item) => `${item.targetType}:${item.targetId}`,
    );
    expect(targets).toEqual([
      `PERSONAL_SESSION:${eligibleSession.id}`,
      `CLASS:${eligibleClass.id}`,
      `CLASS:${day7Class.id}`,
    ]);

    // Al calificar la clase elegible (201), desaparece de /reviews/pending y aparece en /reviews/me.
    const created = await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'CLASS',
        targetId: eligibleClass.id,
        rating: 5,
        comment: '  Muy buena clase nocturna  ',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      targetType: 'CLASS',
      targetId: eligibleClass.id,
      rating: 5,
      comment: 'Muy buena clase nocturna',
    });

    const afterPending = await api()
      .get('/api/v1/reviews/pending')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (afterPending.body.data as Array<{ targetType: string; targetId: number }>).map(
        (item) => `${item.targetType}:${item.targetId}`,
      ),
    ).toEqual([`PERSONAL_SESSION:${eligibleSession.id}`, `CLASS:${day7Class.id}`]);

    const myReviews = await api()
      .get('/api/v1/reviews/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(myReviews.body.data).toHaveLength(1);
    expect(myReviews.body.data[0].id).toBe(created.body.id);
  });

  it('POST /reviews vuelve a verificar condiciones en servidor, evita duplicados y devuelve errores claros', async () => {
    const { member, token } = await createMember();
    const other = await createMember();

    // Clase válida (reserva + check-in mismo día).
    const validClass = await createClass(gymInstant(-2, 9), gymInstant(-2, 10));
    await prisma.classReservation.create({
      data: { classId: validClass.id, memberId: member.id, status: 'CONFIRMED' },
    });
    await prisma.checkIn.create({
      data: {
        memberId: member.id,
        checkedInAt: gymInstant(-2, 8, 30),
        membershipStatus: 'ACTIVE',
        registeredById: receptionId,
      },
    });

    // Dos envíos concurrentes de reseña: uno 201 y otro 409 duplicado.
    const [r1, r2] = await Promise.all([
      api()
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetType: 'CLASS', targetId: validClass.id, rating: 4 }),
      api()
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetType: 'CLASS', targetId: validClass.id, rating: 5 }),
    ]);
    expect([r1.status, r2.status].sort((a, b) => a - b)).toEqual([201, 409]);
    const conflict = r1.status === 409 ? r1 : r2;
    expect(conflict.body.message).toBe('Ya calificaste esta clase o sesión.');

    // Clase sin check-in ese día (el miembro ingresó el día -2, no el día -3) -> 409 claro.
    const reservedOnly = await createClass(gymInstant(-3, 12), gymInstant(-3, 13));
    await prisma.classReservation.create({
      data: { classId: reservedOnly.id, memberId: member.id, status: 'CONFIRMED' },
    });
    const noAttendanceRes = await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'CLASS', targetId: reservedOnly.id, rating: 5 })
      .expect(409);
    expect(noAttendanceRes.body.message).toBe('Solo puedes calificar clases a las que asististe.');

    // Clase con check-in el mismo día DESPUÉS de terminar -> 409 claro.
    const lateClass = await createClass(gymInstant(-4, 8), gymInstant(-4, 9));
    await prisma.classReservation.create({
      data: { classId: lateClass.id, memberId: member.id, status: 'CONFIRMED' },
    });
    await prisma.checkIn.create({
      data: {
        memberId: member.id,
        checkedInAt: gymInstant(-4, 9, 1),
        membershipStatus: 'ACTIVE',
        registeredById: receptionId,
      },
    });
    const lateRes = await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'CLASS', targetId: lateClass.id, rating: 5 })
      .expect(409);
    expect(lateRes.body.message).toBe('Solo puedes calificar clases a las que asististe.');

    // Comentario de exactamente 500 caracteres y calificación mínima 1 -> 201.
    const maxCommentClass = await createClass(gymInstant(-5, 10), gymInstant(-5, 11));
    await prisma.classReservation.create({
      data: { classId: maxCommentClass.id, memberId: member.id, status: 'CONFIRMED' },
    });
    await prisma.checkIn.create({
      data: {
        memberId: member.id,
        checkedInAt: gymInstant(-5, 9, 45),
        membershipStatus: 'ACTIVE',
        registeredById: receptionId,
      },
    });
    await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'CLASS',
        targetId: maxCommentClass.id,
        rating: 1,
        comment: 'a'.repeat(500),
      })
      .expect(201);

    // Sesión NO_SHOW -> 403 claro.
    const noShowSession = await createSession(member.id, gymInstant(-1, 8), gymInstant(-1, 9), {
      status: 'COMPLETED',
      outcome: 'NO_SHOW',
    });
    const noShowRes = await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'PERSONAL_SESSION', targetId: noShowSession.id, rating: 3 })
      .expect(403);
    expect(noShowRes.body.message).toBe('Solo puedes calificar sesiones que se realizaron.');

    // Sesión pasada del 7mo día (hace 8 días) -> 409 claro.
    const oldSession = await createSession(member.id, gymInstant(-8, 10), gymInstant(-8, 11));
    const expiredRes = await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'PERSONAL_SESSION', targetId: oldSession.id, rating: 5 })
      .expect(409);
    expect(expiredRes.body.message).toBe('El plazo de 7 días para calificar ya venció.');

    // Sesión válida (hace 1 día, COMPLETED/COMPLETED) -> 201 y segunda vez 409.
    const validSession = await createSession(member.id, gymInstant(-1, 10), gymInstant(-1, 11));
    await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'PERSONAL_SESSION', targetId: validSession.id, rating: 5 })
      .expect(201);
    const dupSession = await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'PERSONAL_SESSION', targetId: validSession.id, rating: 4 })
      .expect(409);
    expect(dupSession.body.message).toBe('Ya calificaste esta clase o sesión.');

    // Sesión de otro miembro -> 404.
    const otherSession = await createSession(other.member.id, gymInstant(-1, 12), gymInstant(-1, 13));
    await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'PERSONAL_SESSION', targetId: otherSession.id, rating: 5 })
      .expect(404);

    // Validación de DTO: rating 0/6 y comentario > 500 -> 400.
    await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'CLASS', targetId: validClass.id, rating: 6 })
      .expect(400);
    await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'CLASS',
        targetId: validClass.id,
        rating: 5,
        comment: 'a'.repeat(501),
      })
      .expect(400);
  });

  it('autorización: solo MEMBER (ADMIN, RECEPTION y TRAINER reciben 403; sin token 401)', async () => {
    for (const token of [adminToken, receptionToken, trainerToken]) {
      await api().get('/api/v1/reviews/pending').set('Authorization', `Bearer ${token}`).expect(403);
      await api().get('/api/v1/reviews/me').set('Authorization', `Bearer ${token}`).expect(403);
      await api()
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetType: 'CLASS', targetId: 1, rating: 5 })
        .expect(403);
    }
    await api().get('/api/v1/reviews/pending').expect(401);
  });
});
