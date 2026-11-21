import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '@Prisma/services';

/**
 * Prueba de integración de H18 (rutinas de entrenamiento) contra PostgreSQL real.
 *
 * Crea sus propios entrenadores/miembros (e2e.h18.*) y rutinas ([e2e H18]*), y
 * los elimina al terminar.
 */
const PASSWORD = 'Demo1234!';
const EMAIL_PREFIX = 'e2e.h18.';
const ROUTINE_PREFIX = '[e2e H18]';

describe('Rutinas · H18 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let receptionToken: string;
  let trainer1Token: string;
  let trainer2Token: string;
  let member1Id: string;
  let member1Token: string;
  let member2Id: string;
  let member2Token: string;

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
    const email = `${EMAIL_PREFIX}${randomUUID()}@gymhub.test`;
    const user = await prisma.user.create({
      data: { email, fullName, role, passwordHash, ...extra },
    });
    const token = await login(email);
    return { user, token };
  }

  async function cleanUp() {
    await prisma.routine.deleteMany({
      where: {
        OR: [
          { name: { startsWith: ROUTINE_PREFIX } },
          { trainer: { email: { startsWith: EMAIL_PREFIX } } },
          { member: { email: { startsWith: EMAIL_PREFIX } } },
        ],
      },
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

    adminToken = await login('admin@gymhub.test');
    receptionToken = await login('recepcion@gymhub.test');

    const t1 = await createUser('TRAINER', 'Entrenador Uno H18');
    const t2 = await createUser('TRAINER', 'Entrenador Dos H18');
    trainer1Token = t1.token;
    trainer2Token = t2.token;

    const m1 = await createUser('MEMBER', 'Miembro Uno H18', {
      memberCode: `GYM-6${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    });
    const m2 = await createUser('MEMBER', 'Miembro Dos H18', {
      memberCode: `GYM-6${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    });
    member1Id = m1.user.id;
    member1Token = m1.token;
    member2Id = m2.user.id;
    member2Token = m2.token;
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('DB-18.1: 0 series falla por CHECK en BD y borrar rutina elimina sus ejercicios en cascada', async () => {
    const trainer = await prisma.user.findUniqueOrThrow({ where: { email: 'entrenador@gymhub.test' } });
    const routine = await prisma.routine.create({
      data: {
        name: `${ROUTINE_PREFIX} Cascade`,
        trainerId: trainer.id,
        memberId: member1Id,
        daysOfWeek: [1, 3],
        exercises: {
          create: [{ sortOrder: 1, name: 'Press', sets: 3, reps: 10, suggestedWeightKg: 40 }],
        },
      },
    });

    // Restricción CHECK en BD rechaza 0 series.
    await expect(
      prisma.routineExercise.create({
        data: {
          routineId: routine.id,
          sortOrder: 2,
          name: 'Inválido',
          sets: 0,
          reps: 10,
          suggestedWeightKg: 10,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.routineExercise.count({ where: { routineId: routine.id } }),
    ).resolves.toBe(1);

    await prisma.routine.delete({ where: { id: routine.id } });
    await expect(
      prisma.routineExercise.count({ where: { routineId: routine.id } }),
    ).resolves.toBe(0);
  });

  it('TRAINER crea, edita su rutina y la consulta del miembro solo devuelve sus rutinas', async () => {
    const created = await api()
      .post('/api/v1/routines')
      .set('Authorization', `Bearer ${trainer1Token}`)
      .send({
        name: `${ROUTINE_PREFIX} Hipertrofia`,
        memberId: member1Id,
        daysOfWeek: [5, 1, 3],
        exercises: [
          { name: 'Sentadilla', sets: 4, reps: 10, suggestedWeightKg: 70 },
          { name: 'Dominadas', sets: 3, reps: 8, suggestedWeightKg: 0 },
        ],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      name: `${ROUTINE_PREFIX} Hipertrofia`,
      daysOfWeek: [1, 3, 5],
      member: { id: member1Id },
    });
    expect(created.body.exercises).toHaveLength(2);

    // Otro entrenador crea una rutina para member2.
    const otherRoutine = await api()
      .post('/api/v1/routines')
      .set('Authorization', `Bearer ${trainer2Token}`)
      .send({
        name: `${ROUTINE_PREFIX} Fuerza M2`,
        memberId: member2Id,
        daysOfWeek: [2, 4],
        exercises: [{ name: 'Peso muerto', sets: 4, reps: 6, suggestedWeightKg: 100 }],
      })
      .expect(201);

    // Editar una rutina de otro entrenador -> 403.
    await api()
      .patch(`/api/v1/routines/${created.body.id}`)
      .set('Authorization', `Bearer ${trainer2Token}`)
      .send({ name: `${ROUTINE_PREFIX} Robada` })
      .expect(403);

    // El dueño sí puede editarla (nombre, días y reemplazo de ejercicios).
    const updated = await api()
      .patch(`/api/v1/routines/${created.body.id}`)
      .set('Authorization', `Bearer ${trainer1Token}`)
      .send({
        name: `${ROUTINE_PREFIX} Hipertrofia v2`,
        daysOfWeek: [2, 6],
        exercises: [
          { name: 'Prensa', sets: 5, reps: 12, suggestedWeightKg: 120 },
        ],
      })
      .expect(200);
    expect(updated.body.name).toBe(`${ROUTINE_PREFIX} Hipertrofia v2`);
    expect(updated.body.daysOfWeek).toEqual([2, 6]);
    expect(updated.body.exercises).toHaveLength(1);

    // GET /routines/me solo devuelve las rutinas del miembro autenticado.
    const mineM1 = await api()
      .get('/api/v1/routines/me')
      .set('Authorization', `Bearer ${member1Token}`)
      .expect(200);
    expect(mineM1.body.data).toHaveLength(1);
    expect(mineM1.body.data[0].id).toBe(created.body.id);
    expect(mineM1.body.data[0].exercises[0]).toMatchObject({
      name: 'Prensa',
      sets: 5,
      reps: 12,
      suggestedWeightKg: 120,
    });

    const mineM2 = await api()
      .get('/api/v1/routines/me')
      .set('Authorization', `Bearer ${member2Token}`)
      .expect(200);
    expect(mineM2.body.data).toHaveLength(1);
    expect(mineM2.body.data[0].id).toBe(otherRoutine.body.id);

    // DELETE cascada vía endpoint también elimina sus ejercicios y otro trainer recibe 403.
    await api()
      .delete(`/api/v1/routines/${created.body.id}`)
      .set('Authorization', `Bearer ${trainer2Token}`)
      .expect(403);
    await api()
      .delete(`/api/v1/routines/${created.body.id}`)
      .set('Authorization', `Bearer ${trainer1Token}`)
      .expect(204);
    await expect(
      prisma.routineExercise.count({ where: { routineId: created.body.id } }),
    ).resolves.toBe(0);
  });

  it('una solicitud inválida no guarda parcialmente la rutina', async () => {
    const beforeCount = await prisma.routine.count({ where: { memberId: member1Id } });

    // 0 series, peso > 300, nombre < 3, 0 ejercicios, miembro inválido.
    for (const body of [
      {
        name: `${ROUTINE_PREFIX} Cero series`,
        memberId: member1Id,
        daysOfWeek: [1],
        exercises: [{ name: 'Curl', sets: 0, reps: 10, suggestedWeightKg: 10 }],
      },
      {
        name: `${ROUTINE_PREFIX} Peso excesivo`,
        memberId: member1Id,
        daysOfWeek: [1],
        exercises: [{ name: 'Prensa', sets: 3, reps: 10, suggestedWeightKg: 350 }],
      },
      {
        name: 'AB',
        memberId: member1Id,
        daysOfWeek: [1],
        exercises: [{ name: 'Curl', sets: 3, reps: 10, suggestedWeightKg: 10 }],
      },
      {
        name: `${ROUTINE_PREFIX} Sin ejercicios`,
        memberId: member1Id,
        daysOfWeek: [1],
        exercises: [],
      },
    ]) {
      await api()
        .post('/api/v1/routines')
        .set('Authorization', `Bearer ${trainer1Token}`)
        .send(body)
        .expect(400);
    }

    // Miembro inexistente o que no es MEMBER -> 404.
    await api()
      .post('/api/v1/routines')
      .set('Authorization', `Bearer ${trainer1Token}`)
      .send({
        name: `${ROUTINE_PREFIX} No existe`,
        memberId: randomUUID(),
        daysOfWeek: [1],
        exercises: [{ name: 'Curl', sets: 3, reps: 10, suggestedWeightKg: 10 }],
      })
      .expect(404);

    await expect(
      prisma.routine.count({ where: { memberId: member1Id } }),
    ).resolves.toBe(beforeCount);
  });

  it('autorización: solo TRAINER crea/edita rutinas y solo MEMBER consulta GET /routines/me', async () => {
    const body = {
      name: `${ROUTINE_PREFIX} Auth`,
      memberId: member1Id,
      daysOfWeek: [1],
      exercises: [{ name: 'Curl', sets: 3, reps: 10, suggestedWeightKg: 10 }],
    };

    for (const token of [adminToken, receptionToken, member1Token]) {
      await api()
        .post('/api/v1/routines')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(403);
    }
    for (const token of [adminToken, receptionToken, trainer1Token]) {
      await api()
        .get('/api/v1/routines/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }
    await api().post('/api/v1/routines').send(body).expect(401);
    await api().get('/api/v1/routines/me').expect(401);
  });
});
