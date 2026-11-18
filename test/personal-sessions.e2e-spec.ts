import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AvailabilityBlockRepository } from '@Trainers/repositories';
import {
  addGymDays,
  dateFromGymDateAndMinutes,
  formatMinutesHHmm,
  gymDateString,
  gymIsoWeekday,
  gymTimeString,
  parseTimeToMinutes,
} from '@Trainers/services';
import { PrismaService } from '@Prisma/services';
import { AppModule } from './../src/app.module.js';

/**
 * Pruebas de integración e2e para H11 (SCRUM-26): Agendar una sesión con un entrenador.
 *
 * Requiere Postgres levantado, migraciones aplicadas y seed ejecutado.
 * Aísla sus datos mediante entrenadores y clases con prefijo `[e2e H11]`,
 * y restaura `personal_session_pricing` al estado previo al terminar.
 */
const PASSWORD = 'Demo1234!';
const PREFIX = '[e2e H11]';
const EMAIL_PREFIX = 'e2e.h11.';

describe('Sesiones personales · H11 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let availabilityBlockRepo: AvailabilityBlockRepository;

  let adminToken: string;
  let receptionToken: string;
  let trainerToken: string;
  let member1Token: string;
  let member2Token: string;

  let member1Id: string;
  let member2Id: string;
  let activeTrainerId: string;
  let inactiveTrainerId: string;
  let futureWeekdayBlockId: string;

  let previousPricingRow: {
    id: number;
    price: unknown;
    updatedById: string | null;
  } | null = null;

  let slot08Start: Date;
  let slot09Start: Date;
  let slot10Start: Date;
  let slot11hAdvanceStart: Date;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  async function cleanUpTestEntities(): Promise<void> {
    const testUsers = await prisma.user.findMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
      select: { id: true },
    });
    const testTrainerIds = testUsers.map((u) => u.id);

    const sessions = await prisma.personalSession.findMany({
      where:
        testTrainerIds.length > 0
          ? { trainerId: { in: testTrainerIds } }
          : { id: -1 },
      select: { id: true, chargeId: true },
    });
    const sessionIds = sessions.map((s) => s.id);
    const chargeIds = sessions
      .map((s) => s.chargeId)
      .filter((id): id is number => id !== null);

    if (sessionIds.length > 0) {
      await prisma.personalSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }

    if (chargeIds.length > 0) {
      await prisma.receipt.deleteMany({
        where: { chargeId: { in: chargeIds } },
      });
      await prisma.payment.deleteMany({
        where: { chargeId: { in: chargeIds } },
      });
      await prisma.charge.deleteMany({
        where: { id: { in: chargeIds } },
      });
    }

    await prisma.gymClass.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });

    if (testTrainerIds.length > 0) {
      await prisma.availabilityBlock.deleteMany({
        where: { userId: { in: testTrainerIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: testTrainerIds } },
      });
    }
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
    availabilityBlockRepo = app.get(AvailabilityBlockRepository);

    previousPricingRow = await prisma.personalSessionPricing.findUnique({
      where: { id: 1 },
      select: { id: true, price: true, updatedById: true },
    });

    await cleanUpTestEntities();

    const passwordHash = await hash(PASSWORD, 4);
    const suffix = randomUUID().slice(0, 8);

    const activeTrainer = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}trainer.${suffix}@gymhub.test`,
        fullName: `${PREFIX} Entrenador Activo`,
        passwordHash,
        role: 'TRAINER',
        isActive: true,
      },
    });
    activeTrainerId = activeTrainer.id;

    const inactiveTrainer = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}inactive.${suffix}@gymhub.test`,
        fullName: `${PREFIX} Entrenador Inactivo`,
        passwordHash,
        role: 'TRAINER',
        isActive: false,
      },
    });
    inactiveTrainerId = inactiveTrainer.id;

    const member1 = await prisma.user.findUniqueOrThrow({
      where: { email: 'miembro@gymhub.test' },
    });
    const member2 = await prisma.user.findUniqueOrThrow({
      where: { email: 'ana.gomez@gymhub.test' },
    });
    member1Id = member1.id;
    member2Id = member2.id;

    adminToken = await login('admin@gymhub.test');
    receptionToken = await login('recepcion@gymhub.test');
    trainerToken = await login('entrenador@gymhub.test');
    member1Token = await login('miembro@gymhub.test');
    member2Token = await login('ana.gomez@gymhub.test');

    // Día objetivo a 3 días vista en zona horaria America/El_Salvador (>= 12h y <= 14d).
    const now = new Date();
    const todaySv = gymDateString(now);
    const futureDateSv = addGymDays(todaySv, 3);
    const futureWeekday = gymIsoWeekday(futureDateSv);

    slot08Start = dateFromGymDateAndMinutes(futureDateSv, 8 * 60);
    slot09Start = dateFromGymDateAndMinutes(futureDateSv, 9 * 60);
    slot10Start = dateFromGymDateAndMinutes(futureDateSv, 10 * 60);

    // Bloque 08:00-11:30 => espacios 08-09, 09-10, 10-11; descarta fragmento 11:00-11:30.
    const futureBlock = await prisma.availabilityBlock.create({
      data: {
        userId: activeTrainerId,
        weekday: futureWeekday,
        startTime: '08:00',
        endTime: '11:30',
      },
    });
    futureWeekdayBlockId = futureBlock.id;

    // Clase grupal SCHEDULED de 10:00-10:50 SV (cruza 10:00-11:00, contigua a 09:00-10:00).
    await prisma.gymClass.create({
      data: {
        name: `${PREFIX} Spinning 10h`,
        trainerId: activeTrainerId,
        startsAt: slot10Start,
        endsAt: new Date(slot10Start.getTime() + 50 * 60_000),
        capacity: 15,
        status: 'SCHEDULED',
      },
    });

    // Clase CANCELLED a las 08:00 NO debe bloquear el espacio 08:00-09:00.
    await prisma.gymClass.create({
      data: {
        name: `${PREFIX} Clase Cancelada 08h`,
        trainerId: activeTrainerId,
        startsAt: slot08Start,
        endsAt: new Date(slot08Start.getTime() + 50 * 60_000),
        capacity: 10,
        status: 'CANCELLED',
      },
    });

    // Espacio con menos de 12 horas de anticipación (~10h a 11h en SV).
    const rough11h = new Date(now.getTime() + 11 * 60 * 60 * 1000);
    const date11hSv = gymDateString(rough11h);
    const mins11h = parseTimeToMinutes(gymTimeString(rough11h)) ?? 12 * 60;
    const boundedStartMin = mins11h >= 23 * 60 ? mins11h - 60 : mins11h;
    slot11hAdvanceStart = dateFromGymDateAndMinutes(date11hSv, boundedStartMin);

    await prisma.availabilityBlock.create({
      data: {
        userId: activeTrainerId,
        weekday: gymIsoWeekday(date11hSv),
        startTime: formatMinutesHHmm(boundedStartMin),
        endTime: formatMinutesHHmm(boundedStartMin + 60),
      },
    });
  });

  afterAll(async () => {
    await cleanUpTestEntities();
    await prisma.personalSessionPricing.deleteMany({ where: { id: 1 } });
    if (previousPricingRow) {
      await prisma.personalSessionPricing.create({
        data: {
          id: 1,
          price: Number(previousPricingRow.price),
          updatedById: previousPricingRow.updatedById,
        },
      });
    }
    await app.close();
  });

  it('DB-11.1: falla de forma cerrada si no hay tarifa configurada y restringe PUT /pricing a ADMIN', async () => {
    await prisma.personalSessionPricing.deleteMany({ where: { id: 1 } });

    if (!process.env.PERSONAL_SESSION_PRICE) {
      const statusRes = await request(app.getHttpServer())
        .get('/api/v1/personal-sessions/pricing')
        .set('Authorization', `Bearer ${member1Token}`)
        .expect(200);

      expect(statusRes.body).toEqual({ configured: false, price: null });

      await request(app.getHttpServer())
        .post('/api/v1/personal-sessions')
        .set('Authorization', `Bearer ${member1Token}`)
        .send({
          trainerId: activeTrainerId,
          startsAt: slot08Start.toISOString(),
        })
        .expect(503);
    }

    await request(app.getHttpServer())
      .put('/api/v1/personal-sessions/pricing')
      .set('Authorization', `Bearer ${member1Token}`)
      .send({ price: 20 })
      .expect(403);

    await request(app.getHttpServer())
      .put('/api/v1/personal-sessions/pricing')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ price: 20 })
      .expect(403);

    await request(app.getHttpServer())
      .put('/api/v1/personal-sessions/pricing')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ price: 20 })
      .expect(403);

    const updatedRes = await request(app.getHttpServer())
      .put('/api/v1/personal-sessions/pricing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 20 })
      .expect(200);

    expect(updatedRes.body).toEqual({ configured: true, price: 20 });
  });

  it('BE-11.1: lista entrenadores activos, genera espacios de 60 min (sin fragmentos) y rechaza rango de 15 días', async () => {
    await request(app.getHttpServer()).get('/api/v1/trainers').expect(401);

    const trainersRes = await request(app.getHttpServer())
      .get('/api/v1/trainers')
      .set('Authorization', `Bearer ${member1Token}`)
      .expect(200);

    const listedIds = (trainersRes.body.data as Array<{ id: string }>).map(
      (t) => t.id,
    );
    expect(listedIds).toContain(activeTrainerId);
    expect(listedIds).not.toContain(inactiveTrainerId);

    // Rango de 15 días debe responder HTTP 400.
    await request(app.getHttpServer())
      .get(`/api/v1/trainers/${activeTrainerId}/slots`)
      .query({ days: 15 })
      .set('Authorization', `Bearer ${member1Token}`)
      .expect(400);

    const from15 = new Date();
    const to15 = new Date(from15.getTime() + 15 * 86_400_000);
    await request(app.getHttpServer())
      .get(`/api/v1/trainers/${activeTrainerId}/slots`)
      .query({ from: from15.toISOString(), to: to15.toISOString() })
      .set('Authorization', `Bearer ${member1Token}`)
      .expect(400);

    // Consulta de próximos 14 días.
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/v1/trainers/${activeTrainerId}/slots`)
      .query({ days: 14 })
      .set('Authorization', `Bearer ${member1Token}`)
      .expect(200);

    const slots = slotsRes.body.slots as Array<{
      startTime: string;
      endTime: string;
      startsAt: string;
    }>;
    const slotIsoStarts = slots.map((s) => s.startsAt);

    // 08:00 (clase CANCELLED no bloquea) y 09:00 (contigua antes de clase 10:00) están libres.
    expect(slotIsoStarts).toContain(slot08Start.toISOString());
    expect(slotIsoStarts).toContain(slot09Start.toISOString());
    // 10:00 se cruza con clase grupal SCHEDULED -> excluido.
    expect(slotIsoStarts).not.toContain(slot10Start.toISOString());
    // Ningún fragmento < 60 min (ej. 11:00-11:30) aparece.
    const futureDateSv = gymDateString(slot08Start);
    const fragment11Iso = dateFromGymDateAndMinutes(
      futureDateSv,
      11 * 60,
    ).toISOString();
    expect(slotIsoStarts).not.toContain(fragment11Iso);
  });

  it('BE-11.2: aplica permisos, regla de 12h (11h -> 400), agenda con cobro PENDING en Mis pagos y aísla Mis sesiones', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/personal-sessions')
      .send({ trainerId: activeTrainerId, startsAt: slot08Start.toISOString() })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/personal-sessions')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ trainerId: activeTrainerId, startsAt: slot08Start.toISOString() })
      .expect(403);

    // A ~11 horas (< 12h): HTTP 400 con mensaje exacto.
    const earlyRes = await request(app.getHttpServer())
      .post('/api/v1/personal-sessions')
      .set('Authorization', `Bearer ${member1Token}`)
      .send({
        trainerId: activeTrainerId,
        startsAt: slot11hAdvanceStart.toISOString(),
      })
      .expect(400);

    expect(earlyRes.body.message).toBe(
      'Las sesiones se agendan con al menos 12 horas de anticipación.',
    );

    // Espacio cruzado por clase grupal (10:00 SV) no puede agendarse.
    const classConflictRes = await request(app.getHttpServer())
      .post('/api/v1/personal-sessions')
      .set('Authorization', `Bearer ${member1Token}`)
      .send({
        trainerId: activeTrainerId,
        startsAt: slot10Start.toISOString(),
      })
      .expect(409);

    expect(classConflictRes.body.message).toBe('Ese horario ya fue tomado.');

    // Agendamiento válido de 08:00 SV por member1.
    const bookRes = await request(app.getHttpServer())
      .post('/api/v1/personal-sessions')
      .set('Authorization', `Bearer ${member1Token}`)
      .send({
        trainerId: activeTrainerId,
        startsAt: slot08Start.toISOString(),
      })
      .expect(201);

    expect(bookRes.body.trainerId).toBe(activeTrainerId);
    expect(bookRes.body.memberId).toBe(member1Id);
    expect(bookRes.body.availabilityBlockId).toBe(futureWeekdayBlockId);
    expect(bookRes.body.status).toBe('SCHEDULED');
    expect(bookRes.body.price).toBe(20);
    expect(bookRes.body.chargeId).toEqual(expect.any(Number));
    expect(bookRes.body.chargeStatus).toBe('PENDING');

    const createdChargeId = bookRes.body.chargeId as number;

    // El cobro PENDING aparece en "Mis pagos" (GET /api/v1/charges/me?status=PENDING).
    const myChargesRes = await request(app.getHttpServer())
      .get('/api/v1/charges/me')
      .query({ status: 'PENDING' })
      .set('Authorization', `Bearer ${member1Token}`)
      .expect(200);

    const matchingCharge = (
      myChargesRes.body.data as Array<{
        chargeId: number;
        type: string;
        amount: number;
        status: string;
      }>
    ).find((c) => c.chargeId === createdChargeId);

    expect(matchingCharge).toBeDefined();
    expect(matchingCharge?.type).toBe('PERSONAL_SESSION');
    expect(matchingCharge?.amount).toBe(20);
    expect(matchingCharge?.status).toBe('PENDING');

    // "Mis sesiones" muestra la sesión solo a member1, no a member2.
    const m1SessionsRes = await request(app.getHttpServer())
      .get('/api/v1/personal-sessions/me')
      .set('Authorization', `Bearer ${member1Token}`)
      .expect(200);

    expect(
      (m1SessionsRes.body.data as Array<{ id: number }>).some(
        (s) => s.id === bookRes.body.id,
      ),
    ).toBe(true);

    const m2SessionsRes = await request(app.getHttpServer())
      .get('/api/v1/personal-sessions/me')
      .set('Authorization', `Bearer ${member2Token}`)
      .expect(200);

    expect(
      (m2SessionsRes.body.data as Array<{ id: number }>).some(
        (s) => s.id === bookRes.body.id,
      ),
    ).toBe(false);

    // El espacio 08:00 ya no está libre, pero el contiguo 09:00 sigue disponible.
    const slotsAfterRes = await request(app.getHttpServer())
      .get(`/api/v1/trainers/${activeTrainerId}/slots`)
      .query({ days: 14 })
      .set('Authorization', `Bearer ${member2Token}`)
      .expect(200);

    const remainingStarts = (
      slotsAfterRes.body.slots as Array<{ startsAt: string }>
    ).map((s) => s.startsAt);
    expect(remainingStarts).not.toContain(slot08Start.toISOString());
    expect(remainingStarts).toContain(slot09Start.toISOString());

    // Integración H10: AvailabilityBlockRepository detecta la sesión SCHEDULED futura.
    await expect(
      availabilityBlockRepo.hasFutureScheduledSessions(futureWeekdayBlockId),
    ).resolves.toBe(true);

    // No existe opción de cancelar sesión personal en esta versión.
    await request(app.getHttpServer())
      .delete(`/api/v1/personal-sessions/${bookRes.body.id}`)
      .set('Authorization', `Bearer ${member1Token}`)
      .expect(404);
  });

  it('BE-11.2 / DB-11.1: concurrencia real (dos miembros por el mismo espacio => 1x 201 + 1x 409) e índice único parcial', async () => {
    const req1 = request(app.getHttpServer())
      .post('/api/v1/personal-sessions')
      .set('Authorization', `Bearer ${member1Token}`)
      .send({
        trainerId: activeTrainerId,
        startsAt: slot09Start.toISOString(),
      });

    const req2 = request(app.getHttpServer())
      .post('/api/v1/personal-sessions')
      .set('Authorization', `Bearer ${member2Token}`)
      .send({
        trainerId: activeTrainerId,
        startsAt: slot09Start.toISOString(),
      });

    const responses = await Promise.all([req1, req2]);
    const statuses = responses.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const conflictResponse = responses.find((r) => r.status === 409);
    expect(conflictResponse?.body.message).toBe('Ese horario ya fue tomado.');

    const createdResponse = responses.find((r) => r.status === 201);
    const createdSessionId = createdResponse?.body.id as number;
    expect(createdSessionId).toEqual(expect.any(Number));

    // Exactamente 1 sesión SCHEDULED y 1 cobro asociado para ese horario (sin duplicados ni huérfanos).
    const sessionsAtSlot = await prisma.personalSession.findMany({
      where: {
        trainerId: activeTrainerId,
        startsAt: slot09Start,
      },
    });
    expect(sessionsAtSlot).toHaveLength(1);
    expect(sessionsAtSlot[0].chargeId).toEqual(expect.any(Number));

    const chargesForSlot = await prisma.charge.count({
      where: { id: sessionsAtSlot[0].chargeId! },
    });
    expect(chargesForSlot).toBe(1);

    // Prueba del índice único parcial en PostgreSQL:
    // 1) Otro INSERT SCHEDULED directo al mismo (trainer_id, starts_at) falla por constraint único.
    await expect(
      prisma.personalSession.create({
        data: {
          trainerId: activeTrainerId,
          memberId: member2Id,
          startsAt: slot09Start,
          endsAt: new Date(slot09Start.getTime() + 60 * 60_000),
          status: 'SCHEDULED',
        },
      }),
    ).rejects.toThrow();

    // 2) Al pasar la sesión a CANCELLED, una nueva SCHEDULED en el mismo inicio sí es permitida.
    await prisma.personalSession.update({
      where: { id: createdSessionId },
      data: { status: 'CANCELLED' },
    });

    const rebookedAfterCancel = await prisma.personalSession.create({
      data: {
        trainerId: activeTrainerId,
        memberId: member1Id,
        startsAt: slot09Start,
        endsAt: new Date(slot09Start.getTime() + 60 * 60_000),
        status: 'SCHEDULED',
      },
    });
    expect(rebookedAfterCancel.status).toBe('SCHEDULED');
  });
});
