import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '@Prisma/services';

/**
 * Prueba de integración de H13 (check-in) contra la base de datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido.
 * Crea sus propios miembros (e2e.h13.*) y los borra al terminar con sus
 * ingresos.
 */
const PASSWORD = 'Demo1234!';
const EMAIL_PREFIX = 'e2e.h13.';

describe('Check-in · H13 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let receptionToken: string;
  let memberToken: string;
  let trainerToken: string;

  const api = () => request(app.getHttpServer());
  const lookup = (q: string, token = receptionToken) =>
    api().get('/api/v1/check-ins/lookup').query({ q }).set('Authorization', `Bearer ${token}`);
  const checkIn = (memberId: string, token = receptionToken) =>
    api().post('/api/v1/check-ins').set('Authorization', `Bearer ${token}`).send({ memberId });

  /** Miembro nuevo, sin membresías ni ingresos, con un nombre único. */
  async function newMember(name = `Ingreso ${randomUUID().slice(0, 8)}`) {
    const passwordHash = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@gymhub.test' } })
    ).passwordHash;
    const code = `GYM-9${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
    return prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}${randomUUID()}@gymhub.test`,
        fullName: name,
        role: 'MEMBER',
        memberCode: code,
        passwordHash,
      },
    });
  }

  async function cleanUp() {
    const ofTestMembers = { member: { email: { startsWith: EMAIL_PREFIX } } };
    await prisma.checkIn.deleteMany({ where: ofTestMembers });
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

    const login = async (email: string) =>
      (await api().post('/api/v1/auth/login').send({ email, password: PASSWORD })).body
        .accessToken as string;
    receptionToken = await login('recepcion@gymhub.test');
    memberToken = await login('miembro@gymhub.test');
    trainerToken = await login('entrenador@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  describe('GET /check-ins/lookup', () => {
    it('encuentra por código exacto con el estado de la membresía y la próxima fecha de pago', async () => {
      const res = await lookup('gym-000001');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      const [juan] = res.body.data;
      expect(juan).toMatchObject({ memberCode: 'GYM-000001', fullName: 'Juan Perez' });
      expect(['ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'NONE']).toContain(juan.membershipStatus);
      expect(juan.nextPaymentDate === null || /^\d{4}-\d{2}-\d{2}$/.test(juan.nextPaymentDate)).toBe(
        true,
      );
    });

    it('un miembro sin membresía sale con NONE y sin próxima fecha de pago', async () => {
      const member = await newMember();
      const res = await lookup(member.memberCode as string);
      expect(res.body.data).toEqual([
        {
          memberId: member.id,
          memberCode: member.memberCode,
          fullName: member.fullName,
          membershipStatus: 'NONE',
          nextPaymentDate: null,
        },
      ]);
    });

    it('un dato que no corresponde a ningún miembro devuelve una lista vacía', async () => {
      const res = await lookup(`no-existe-${randomUUID()}`.slice(0, 30));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('devuelve como máximo 10 resultados', async () => {
      const shared = `Repetido ${randomUUID().slice(0, 6)}`;
      for (let i = 0; i < 12; i++) await newMember(`${shared} ${i}`);
      const res = await lookup(shared);
      expect(res.body.data).toHaveLength(10);
    });

    it('400 con menos de 2 caracteres', async () => {
      expect((await lookup(' a ')).status).toBe(400);
    });
  });

  describe('POST /check-ins', () => {
    it('201 guarda la hora del servidor, quien registra y el estado de la membresía', async () => {
      const member = await newMember();
      const before = Date.now();

      const res = await checkIn(member.id);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        memberCode: member.memberCode,
        membershipStatus: 'NONE',
        isException: false,
      });
      const at = new Date(res.body.checkedInAt).getTime();
      expect(at).toBeGreaterThanOrEqual(before - 1000);
      expect(at).toBeLessThanOrEqual(Date.now() + 1000);

      const saved = await prisma.checkIn.findUniqueOrThrow({
        where: { id: res.body.checkInId },
        include: { registeredBy: true },
      });
      expect(saved.registeredBy.email).toBe('recepcion@gymhub.test');
      expect(saved.membershipStatus).toBe('NONE');
    });

    it('un segundo ingreso dentro de 30 minutos responde 409 con el mensaje de la historia', async () => {
      const member = await newMember();
      await checkIn(member.id);
      const res = await checkIn(member.id);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Este miembro ya registró su ingreso hace menos de 30 minutos.');
      await expect(prisma.checkIn.count({ where: { memberId: member.id } })).resolves.toBe(1);
    });

    it('un ingreso de hace 10 minutos también bloquea; uno de hace 31 minutos no', async () => {
      const recent = await newMember();
      const old = await newMember();
      const reception = await prisma.user.findUniqueOrThrow({
        where: { email: 'recepcion@gymhub.test' },
      });
      const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
      await prisma.checkIn.create({
        data: {
          memberId: recent.id,
          checkedInAt: minutesAgo(10),
          membershipStatus: 'NONE',
          registeredById: reception.id,
        },
      });
      await prisma.checkIn.create({
        data: {
          memberId: old.id,
          checkedInAt: minutesAgo(31),
          membershipStatus: 'NONE',
          registeredById: reception.id,
        },
      });

      expect((await checkIn(recent.id)).status).toBe(409);
      expect((await checkIn(old.id)).status).toBe(201);
    });

    it('dos registros simultáneos del mismo miembro: uno 201 y otro 409', async () => {
      const member = await newMember();
      const results = await Promise.all([checkIn(member.id), checkIn(member.id)]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      await expect(prisma.checkIn.count({ where: { memberId: member.id } })).resolves.toBe(1);
    });

    it('404 si el miembro no existe o no es miembro, y 400 con un id inválido', async () => {
      expect((await checkIn(randomUUID())).status).toBe(404);
      const trainer = await prisma.user.findUniqueOrThrow({
        where: { email: 'entrenador@gymhub.test' },
      });
      expect((await checkIn(trainer.id)).status).toBe(404);
      expect((await checkIn('no-es-uuid')).status).toBe(400);
    });
  });

  describe('Permisos', () => {
    it('un Miembro o un Entrenador reciben 403 y sin sesión 401', async () => {
      const member = await newMember();
      expect((await lookup('Juan', memberToken)).status).toBe(403);
      expect((await lookup('Juan', trainerToken)).status).toBe(403);
      expect((await checkIn(member.id, memberToken)).status).toBe(403);
      expect((await checkIn(member.id, trainerToken)).status).toBe(403);
      expect((await api().get('/api/v1/check-ins/lookup').query({ q: 'Juan' })).status).toBe(401);
    });
  });
});
