import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { ClassRepository } from '@Classes/repositories';

/**
 * Pruebas de integración e2e para H06 (SCRUM-21): Programar las clases grupales.
 *
 * Requiere Postgres levantado, migraciones aplicadas y seed ejecutado.
 * Crea sus propias clases con prefijo `[e2e H06]` y las limpia al terminar,
 * sin borrar ni reiniciar datos existentes ni las 6 clases del seed.
 */
const PASSWORD = 'Demo1234!';
const NAME_PREFIX = '[e2e H06]';

function futureWindow(
  daysAhead: number,
  startHourUtc: number,
  startMinuteUtc: number,
  durationMinutes: number,
): { startsAt: string; endsAt: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysAhead,
      startHourUtc,
      startMinuteUtc,
      0,
      0,
    ),
  );
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

describe('Clases grupales · H06 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let classRepository: ClassRepository;
  let adminToken: string;
  let receptionToken: string;
  let trainerToken: string;
  let memberToken: string;
  let trainerId: string;
  let memberId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  async function cleanUp(): Promise<void> {
    await prisma.gymClass.deleteMany({
      where: { name: { startsWith: NAME_PREFIX } },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
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
    classRepository = app.get(ClassRepository);

    const trainer = await prisma.user.findUniqueOrThrow({
      where: { email: 'entrenador@gymhub.test' },
    });
    const member = await prisma.user.findUniqueOrThrow({
      where: { email: 'miembro@gymhub.test' },
    });
    trainerId = trainer.id;
    memberId = member.id;

    await cleanUp();

    adminToken = await login('admin@gymhub.test');
    receptionToken = await login('recepcion@gymhub.test');
    trainerToken = await login('entrenador@gymhub.test');
    memberToken = await login('miembro@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  const createClass = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const updateClass = (token: string, classId: number, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1/classes/${classId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('conserva las 6 clases de prueba cargadas por el seed (DB-6.1)', async () => {
    const seededCount = await prisma.gymClass.count({
      where: {
        trainerId,
        NOT: { name: { startsWith: NAME_PREFIX } },
      },
    });
    expect(seededCount).toBeGreaterThanOrEqual(6);
  });

  it('Criterio 1 y 6: ADMIN programa una clase y queda en estado SCHEDULED (201)', async () => {
    const window = futureWindow(20, 10, 0, 60);
    const res = await createClass(adminToken, {
      name: `${NAME_PREFIX} Funcional`,
      trainerId,
      ...window,
      capacity: 25,
    }).expect(201);

    expect(res.body).toMatchObject({
      name: `${NAME_PREFIX} Funcional`,
      trainerId,
      capacity: 25,
      confirmedReservations: 0,
      status: 'SCHEDULED',
      trainer: {
        id: trainerId,
        email: 'entrenador@gymhub.test',
      },
    });
  });

  it('Criterio 6: rechaza a usuarios con rol RECEPCION, TRAINER o MEMBER (403) y sin sesión (401)', async () => {
    const payload = {
      name: `${NAME_PREFIX} No Autorizada`,
      trainerId,
      ...futureWindow(21, 10, 0, 60),
      capacity: 15,
    };

    await createClass(receptionToken, payload).expect(403);
    await createClass(trainerToken, payload).expect(403);
    await createClass(memberToken, payload).expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/classes')
      .send(payload)
      .expect(401);
  });

  it('Criterio 6: verifica que el entrenador elegido exista (404) y tenga rol TRAINER (400)', async () => {
    const window = futureWindow(22, 10, 0, 60);

    const notTrainerRes = await createClass(adminToken, {
      name: `${NAME_PREFIX} Rol Invalido`,
      trainerId: memberId,
      ...window,
      capacity: 15,
    }).expect(400);
    expect(notTrainerRes.body.message).toBe(
      'El usuario seleccionado como entrenador debe tener el rol TRAINER.',
    );

    await createClass(adminToken, {
      name: `${NAME_PREFIX} No Existe`,
      trainerId: randomUUID(),
      ...window,
      capacity: 15,
    }).expect(404);
  });

  it('Criterio 1 y 4: valida límites de nombre (3-60), cupo (1-50), fecha pasada y duración (30-180 min)', async () => {
    const validWindow = futureWindow(23, 10, 0, 60);

    // Nombre corto (< 3)
    await createClass(adminToken, {
      name: 'AB',
      trainerId,
      ...validWindow,
      capacity: 20,
    }).expect(400);

    // Cupo 0 y 51
    await createClass(adminToken, {
      name: `${NAME_PREFIX} Cupo Cero`,
      trainerId,
      ...validWindow,
      capacity: 0,
    }).expect(400);

    await createClass(adminToken, {
      name: `${NAME_PREFIX} Cupo 51`,
      trainerId,
      ...validWindow,
      capacity: 51,
    }).expect(400);

    // Fecha pasada
    const pastStart = new Date(Date.now() - 3_600_000);
    const pastEnd = new Date(pastStart.getTime() + 3_600_000);
    await createClass(adminToken, {
      name: `${NAME_PREFIX} Pasada`,
      trainerId,
      startsAt: pastStart.toISOString(),
      endsAt: pastEnd.toISOString(),
      capacity: 20,
    }).expect(400);

    // endsAt igual a startsAt
    await createClass(adminToken, {
      name: `${NAME_PREFIX} Sin Duracion`,
      trainerId,
      startsAt: validWindow.startsAt,
      endsAt: validWindow.startsAt,
      capacity: 20,
    }).expect(400);

    // Duración 25 min (< 30) y 190 min (> 180)
    await createClass(adminToken, {
      name: `${NAME_PREFIX} Corta`,
      trainerId,
      ...futureWindow(23, 12, 0, 25),
      capacity: 20,
    }).expect(400);

    await createClass(adminToken, {
      name: `${NAME_PREFIX} Larga`,
      trainerId,
      ...futureWindow(23, 14, 0, 190),
      capacity: 20,
    }).expect(400);
  });

  it('Criterio 5 y BE-6.1: clase de 18:00 a 18:50 se cruza con otra a las 18:30 (409), pero una que termina a las 18:00 NO se cruza con otra que inicia a las 18:00 (201)', async () => {
    // 1. Clase base de 18:00 a 18:50
    const baseWindow = futureWindow(25, 18, 0, 50);
    await createClass(adminToken, {
      name: `${NAME_PREFIX} Spinning 18:00`,
      trainerId,
      ...baseWindow,
      capacity: 20,
    }).expect(201);

    // 2. Clase que inicia a las 18:30 del mismo día -> 409 Conflict
    const overlapWindow = futureWindow(25, 18, 30, 50);
    const conflictRes = await createClass(adminToken, {
      name: `${NAME_PREFIX} Cruce 18:30`,
      trainerId,
      ...overlapWindow,
      capacity: 20,
    }).expect(409);

    expect(conflictRes.body.message).toContain(`${NAME_PREFIX} Spinning 18:00`);
    expect(conflictRes.body.message).toContain('18:00 a 18:50');

    // 3. Clase contigua de 17:00 a 18:00 (termina exactamente a las 18:00 cuando inicia la otra) -> 201 Created
    const contiguousBefore = futureWindow(25, 17, 0, 60);
    await createClass(adminToken, {
      name: `${NAME_PREFIX} Contigua 17:00-18:00`,
      trainerId,
      ...contiguousBefore,
      capacity: 15,
    }).expect(201);

    // 4. Clase contigua que inicia a las 18:50 (cuando termina la de 18:00-18:50) -> 201 Created
    const contiguousAfter = futureWindow(25, 18, 50, 40);
    await createClass(adminToken, {
      name: `${NAME_PREFIX} Contigua 18:50-19:30`,
      trainerId,
      ...contiguousAfter,
      capacity: 15,
    }).expect(201);
  });

  it('Criterio 2 y 3 (BE-6.1): con 12 reservas confirmadas, bajar el cupo de 20 a 10 devuelve 409 y conserva 20; cambiarlo a 12 o 30 se permite (200)', async () => {
    const created = await createClass(adminToken, {
      name: `${NAME_PREFIX} Control de Cupo`,
      trainerId,
      ...futureWindow(26, 9, 0, 60),
      capacity: 20,
    }).expect(201);

    const classId = created.body.id as number;

    const spy = vi
      .spyOn(classRepository, 'countConfirmedReservations')
      .mockResolvedValue(12);

    try {
      const rejected = await updateClass(adminToken, classId, {
        capacity: 10,
      }).expect(409);

      expect(rejected.body.message).toBe(
        'El cupo no puede ser menor a las 12 reservas confirmadas.',
      );

      const persisted = await prisma.gymClass.findUniqueOrThrow({
        where: { id: classId },
      });
      expect(persisted.capacity).toBe(20);

      const equalToConfirmed = await updateClass(adminToken, classId, {
        capacity: 12,
      }).expect(200);
      expect(equalToConfirmed.body.capacity).toBe(12);
      expect(equalToConfirmed.body.confirmedReservations).toBe(12);

      const raised = await updateClass(adminToken, classId, {
        capacity: 30,
      }).expect(200);
      expect(raised.body.capacity).toBe(30);
    } finally {
      spy.mockRestore();
    }
  });

  it('DB-6.1: las restricciones CHECK de PostgreSQL rechazan cupos 0 y 51 y endsAt igual a startsAt', async () => {
    const { startsAt, endsAt } = futureWindow(27, 10, 0, 60);
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    await expect(
      prisma.gymClass.create({
        data: {
          name: `${NAME_PREFIX} Check 0`,
          trainerId,
          startsAt: startDate,
          endsAt: endDate,
          capacity: 0,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.gymClass.create({
        data: {
          name: `${NAME_PREFIX} Check 51`,
          trainerId,
          startsAt: startDate,
          endsAt: endDate,
          capacity: 51,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.gymClass.create({
        data: {
          name: `${NAME_PREFIX} Check Equal Time`,
          trainerId,
          startsAt: startDate,
          endsAt: startDate,
          capacity: 20,
        },
      }),
    ).rejects.toThrow();
  });
});
