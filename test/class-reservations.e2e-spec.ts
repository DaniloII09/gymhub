import { Global, Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  MEMBERSHIP_STATUS_SERVICE,
  type CurrentMembership,
  type MembershipStatusService,
} from '@Common/contracts';
import { PrismaService } from '@Prisma/services';
import { AppModule } from './../src/app.module.js';

/**
 * Pruebas de integración e2e para H07 (SCRUM-22): Reservar un cupo en una clase.
 *
 * Requiere PostgreSQL levantado, migraciones aplicadas y seed ejecutado.
 * - La primera suite levanta `AppModule` real, con el estado de membresía de
 *   H04 (BE-4.3), para demostrar que el listado BE-7.1 funciona y que un
 *   miembro sin membresía no puede reservar (HTTP 403).
 * - La segunda suite importa además un módulo DE PRUEBAS con una implementación
 *   controlada de `MEMBERSHIP_STATUS_SERVICE` para verificar contra PostgreSQL
 *   real las reglas de membresía, el índice único parcial (`CANCELLED` -> nueva
 *   `CONFIRMED`, doble `CONFIRMED` -> 409) y la concurrencia real (20 solicitudes
 *   simultáneas por los últimos 3 cupos = exactamente 3 x 201 y 17 x 409).
 */
const PASSWORD = 'Demo1234!';
const CLASS_PREFIX = '[e2e H07]';
const MEMBER_EMAIL_PREFIX = 'e2e.h07.';

function futureClassWindow(
  daysAhead: number,
  startHourUtc = 14,
  durationMinutes = 60,
): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(startHourUtc, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return { startsAt, endsAt };
}

describe('Reservas de clases · H07 sin proveedor H04 (AppModule real)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let memberToken: string;
  let trainerId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  async function cleanUp(): Promise<void> {
    await prisma.classReservation.deleteMany({
      where: { gymClass: { name: { startsWith: CLASS_PREFIX } } },
    });
    await prisma.gymClass.deleteMany({
      where: { name: { startsWith: CLASS_PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: MEMBER_EMAIL_PREFIX } },
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
    trainerId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'entrenador@gymhub.test' },
      })
    ).id;

    await cleanUp();
    adminToken = await login('admin@gymhub.test');
    memberToken = await login('miembro@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('BE-7.1: lista clases SCHEDULED con spotsLeft correcto (20 - 17 = 3), oculta CANCELLED a MEMBER y rechaza rango de 8 días con 400', async () => {
    const { startsAt, endsAt } = futureClassWindow(3, 15, 60);

    const scheduledClass = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Spinning Cupo 3`,
        trainerId,
        startsAt,
        endsAt,
        capacity: 20,
        status: 'SCHEDULED',
      },
    });

    const cancelledClass = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Cancelada`,
        trainerId,
        startsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
        endsAt: new Date(endsAt.getTime() + 2 * 3_600_000),
        capacity: 20,
        status: 'CANCELLED',
      },
    });

    const fillers = await prisma.user.createManyAndReturn({
      data: Array.from({ length: 17 }, (_, idx) => ({
        email: `${MEMBER_EMAIL_PREFIX}filler.${idx}@gymhub.test`,
        fullName: `Filler H07 ${idx}`,
        passwordHash: 'not-used',
        role: 'MEMBER',
      })),
      select: { id: true },
    });

    await prisma.classReservation.createMany({
      data: fillers.map((u) => ({
        classId: scheduledClass.id,
        memberId: u.id,
        status: 'CONFIRMED',
      })),
    });

    // MEMBER lista próximos 7 días (sin parámetros) -> ve SCHEDULED con spotsLeft: 3, NO ve CANCELLED.
    const memberRes = await request(app.getHttpServer())
      .get('/api/v1/classes')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(memberRes.body).toContainEqual(
      expect.objectContaining({
        id: scheduledClass.id,
        name: scheduledClass.name,
        capacity: 20,
        confirmedReservations: 17,
        spotsLeft: 3,
        status: 'SCHEDULED',
        trainer: expect.objectContaining({
          id: trainerId,
          email: 'entrenador@gymhub.test',
        }),
      }),
    );

    expect(
      (memberRes.body as { id: number }[]).some(
        (item) => item.id === cancelledClass.id,
      ),
    ).toBe(false);

    // ADMIN conserva compatibilidad y sí ve CANCELLED en su rango.
    const adminRes = await request(app.getHttpServer())
      .get('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({
        from: new Date(startsAt.getTime() - 3_600_000).toISOString(),
        to: new Date(endsAt.getTime() + 4 * 3_600_000).toISOString(),
      })
      .expect(200);

    expect(adminRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: scheduledClass.id, status: 'SCHEDULED' }),
        expect.objectContaining({ id: cancelledClass.id, status: 'CANCELLED' }),
      ]),
    );

    // Rango de 8 días para MEMBER -> HTTP 400.
    const from8 = new Date();
    const to8 = new Date(from8.getTime() + 8 * 24 * 60 * 60 * 1000);
    await request(app.getHttpServer())
      .get('/api/v1/classes')
      .set('Authorization', `Bearer ${memberToken}`)
      .query({ from: from8.toISOString(), to: to8.toISOString() })
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/classes')
      .set('Authorization', `Bearer ${memberToken}`)
      .query({ days: 8 })
      .expect(400);
  });

  it('BE-7.2 con el estado real de H04: un miembro sin membresía responde 403 y no crea reservas', async () => {
    const { startsAt, endsAt } = futureClassWindow(4, 15, 60);
    const gymClass = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Sin membresía`,
        trainerId,
        startsAt,
        endsAt,
        capacity: 15,
        status: 'SCHEDULED',
      },
    });
    const email = `${MEMBER_EMAIL_PREFIX}sin.membresia.${randomUUID()}@gymhub.test`;
    await prisma.user.create({
      data: {
        email,
        fullName: 'Miembro sin membresía',
        role: 'MEMBER',
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    });
    const noMembershipToken = await login(email);

    await request(app.getHttpServer())
      .post(`/api/v1/classes/${gymClass.id}/reservations`)
      .set('Authorization', `Bearer ${noMembershipToken}`)
      .expect(403);

    await expect(
      prisma.classReservation.count({ where: { classId: gymClass.id } }),
    ).resolves.toBe(0);
  });
});

describe('Reservas de clases · H07 con contrato de membresía (PostgreSQL real + concurrencia)', () => {
  const membershipsByMember = new Map<string, CurrentMembership>();

  const testMembershipService: MembershipStatusService = {
    currentFor(memberId: string): Promise<CurrentMembership> {
      return Promise.resolve(
        membershipsByMember.get(memberId) ?? {
          status: 'NONE',
          planName: null,
          planType: null,
          endDate: null,
          daysLeft: null,
        },
      );
    },
  };

  @Global()
  @Module({
    providers: [
      {
        provide: MEMBERSHIP_STATUS_SERVICE,
        useValue: testMembershipService,
      },
    ],
    exports: [MEMBERSHIP_STATUS_SERVICE],
  })
  class TestMembershipProviderModule {}

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let memberToken: string;
  let trainerToken: string;
  let receptionToken: string;
  let memberId: string;
  let trainerId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  async function cleanUp(): Promise<void> {
    await prisma.classReservation.deleteMany({
      where: {
        OR: [
          { gymClass: { name: { startsWith: CLASS_PREFIX } } },
          { member: { email: { startsWith: MEMBER_EMAIL_PREFIX } } },
        ],
      },
    });
    await prisma.gymClass.deleteMany({
      where: { name: { startsWith: CLASS_PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: MEMBER_EMAIL_PREFIX } },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TestMembershipProviderModule],
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
    memberId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'miembro@gymhub.test' },
      })
    ).id;
    trainerId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'entrenador@gymhub.test' },
      })
    ).id;

    await cleanUp();
    memberToken = await login('miembro@gymhub.test');
    trainerToken = await login('entrenador@gymhub.test');
    receptionToken = await login('recepcion@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  const activeMonthly = (): CurrentMembership => ({
    status: 'ACTIVE',
    planName: 'Mensual',
    planType: 'MONTHLY',
    endDate: new Date(Date.now() + 30 * 86_400_000),
    daysLeft: 30,
  });

  it('valida roles, membresías (NONE/EXPIRED/DROP_IN -> 403) y reserva MONTHLY/QUARTERLY (201) reflejada en Mis reservas', async () => {
    const { startsAt, endsAt } = futureClassWindow(5, 16, 60);
    const gymClass = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Reglas Membresia`,
        trainerId,
        startsAt,
        endsAt,
        capacity: 15,
        status: 'SCHEDULED',
      },
    });

    // Sin sesión -> 401; otros roles -> 403
    await request(app.getHttpServer())
      .post(`/api/v1/classes/${gymClass.id}/reservations`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/classes/${gymClass.id}/reservations`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/classes/${gymClass.id}/reservations`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .expect(403);

    // Membresía NONE / EXPIRED -> 403 exacto
    membershipsByMember.set(memberId, {
      status: 'EXPIRED',
      planName: 'Mensual',
      planType: 'MONTHLY',
      endDate: new Date('2026-01-01'),
      daysLeft: 0,
    });
    const inactiveRes = await request(app.getHttpServer())
      .post(`/api/v1/classes/${gymClass.id}/reservations`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    expect(inactiveRes.body.message).toBe(
      'Necesitas una membresía activa para reservar.',
    );

    // Membresía DROP_IN ACTIVE -> 403 exacto
    membershipsByMember.set(memberId, {
      status: 'ACTIVE',
      planName: 'Clase suelta',
      planType: 'DROP_IN',
      endDate: new Date(Date.now() + 86_400_000),
      daysLeft: 1,
    });
    const dropInRes = await request(app.getHttpServer())
      .post(`/api/v1/classes/${gymClass.id}/reservations`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    expect(dropInRes.body.message).toBe(
      'La clase suelta se compra en recepción y no permite reservar.',
    );

    // Membresía QUARTERLY ACTIVE -> 201 Created; incluso enviando otro memberId en el body usa siempre el token
    membershipsByMember.set(memberId, {
      status: 'ACTIVE',
      planName: 'Trimestral',
      planType: 'QUARTERLY',
      endDate: new Date(Date.now() + 90 * 86_400_000),
      daysLeft: 90,
    });
    const reserved = await request(app.getHttpServer())
      .post(`/api/v1/classes/${gymClass.id}/reservations`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ memberId: randomUUID() })
      .expect(201);

    expect(reserved.body).toMatchObject({
      classId: gymClass.id,
      memberId,
      status: 'CONFIRMED',
      gymClass: {
        id: gymClass.id,
        confirmedReservations: 1,
        spotsLeft: 14,
      },
    });

    // Aparece en "Mis reservas" del miembro autenticado
    const myReservations = await request(app.getHttpServer())
      .get('/api/v1/classes/reservations/me')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(myReservations.body.data).toContainEqual(
      expect.objectContaining({
        id: reserved.body.id,
        classId: gymClass.id,
        status: 'CONFIRMED',
      }),
    );

    // Segunda reserva CONFIRMED en la misma clase -> 409 "Ya tienes una reserva en esta clase."
    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/classes/${gymClass.id}/reservations`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(409);
    expect(duplicate.body.message).toBe('Ya tienes una reserva en esta clase.');
  });

  it('DB-7.1 índice único parcial: permite nueva reserva CONFIRMED tras CANCELLED, e impide dos CONFIRMED en BD', async () => {
    const { startsAt, endsAt } = futureClassWindow(6, 17, 60);
    const gymClass = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Re-reserva Post Cancelacion`,
        trainerId,
        startsAt,
        endsAt,
        capacity: 15,
        status: 'SCHEDULED',
      },
    });

    // Insertar reserva previa CANCELLED para miembro@gymhub.test
    const cancelledPrev = await prisma.classReservation.create({
      data: {
        classId: gymClass.id,
        memberId,
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    membershipsByMember.set(memberId, activeMonthly());

    // El índice único parcial permite crear una nueva reserva CONFIRMED
    const newReservation = await request(app.getHttpServer())
      .post(`/api/v1/classes/${gymClass.id}/reservations`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(201);

    expect(newReservation.body.id).not.toBe(cancelledPrev.id);
    expect(newReservation.body.status).toBe('CONFIRMED');

    // A nivel de PostgreSQL directo, intentar una segunda CONFIRMED viola el índice único parcial
    await expect(
      prisma.classReservation.create({
        data: {
          classId: gymClass.id,
          memberId,
          status: 'CONFIRMED',
        },
      }),
    ).rejects.toThrow();
  });

  it('BE-7.2 concurrencia real en PostgreSQL: 20 solicitudes simultáneas por los últimos 3 cupos -> exactamente 3 reciben 201 y 17 reciben 409 (CLASS_FULL)', async () => {
    const { startsAt, endsAt } = futureClassWindow(6, 18, 60);
    const gymClass = await prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} Concurrencia 20vs3`,
        trainerId,
        startsAt,
        endsAt,
        capacity: 20,
        status: 'SCHEDULED',
      },
    });

    const passwordHash = await bcrypt.hash(PASSWORD, 4);

    // 17 miembros ya confirmados -> quedan exactamente 3 cupos (20 - 17 = 3)
    const alreadyBooked = await prisma.user.createManyAndReturn({
      data: Array.from({ length: 17 }, (_, i) => ({
        email: `${MEMBER_EMAIL_PREFIX}pre.${i}@gymhub.test`,
        fullName: `PreBooked ${i}`,
        passwordHash,
        role: 'MEMBER',
      })),
      select: { id: true },
    });

    await prisma.classReservation.createMany({
      data: alreadyBooked.map((u) => ({
        classId: gymClass.id,
        memberId: u.id,
        status: 'CONFIRMED',
      })),
    });

    // 20 miembros distintos compitiendo simultáneamente por los últimos 3 cupos
    const competitors = await prisma.user.createManyAndReturn({
      data: Array.from({ length: 20 }, (_, i) => ({
        email: `${MEMBER_EMAIL_PREFIX}race.${i}@gymhub.test`,
        fullName: `Competidor H07 ${i}`,
        passwordHash,
        role: 'MEMBER',
      })),
      select: { id: true, email: true },
    });

    for (const competitor of competitors) {
      membershipsByMember.set(competitor.id, activeMonthly());
    }

    const tokens = await Promise.all(
      competitors.map((c) => login(c.email)),
    );

    const responses = await Promise.all(
      tokens.map((token) =>
        request(app.getHttpServer())
          .post(`/api/v1/classes/${gymClass.id}/reservations`)
          .set('Authorization', `Bearer ${token}`),
      ),
    );

    const created = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(created).toHaveLength(3);
    expect(conflicts).toHaveLength(17);

    for (const conflict of conflicts) {
      expect(conflict.body).toMatchObject({
        statusCode: 409,
        code: 'CLASS_FULL',
        message: 'La clase está llena.',
      });
    }

    // Total confirmado en PostgreSQL jamás supera la capacidad (20)
    await expect(
      prisma.classReservation.count({
        where: { classId: gymClass.id, status: 'CONFIRMED' },
      }),
    ).resolves.toBe(20);
  }, 20_000);
});
