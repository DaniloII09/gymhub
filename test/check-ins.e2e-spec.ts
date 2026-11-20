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

describe('Check-in · H13 y H14 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let receptionToken: string;
  let memberToken: string;
  let trainerToken: string;

  const api = () => request(app.getHttpServer());
  const lookup = (q: string, token = receptionToken) =>
    api().get('/api/v1/check-ins/lookup').query({ q }).set('Authorization', `Bearer ${token}`);
  const checkIn = (memberId: string, token = receptionToken, extra: object = {}) =>
    api()
      .post('/api/v1/check-ins')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId, ...extra });

  /** Membresía guardada directamente, con su cobro pagado o no. */
  async function giveMembership(
    memberId: string,
    opts: { planType?: 'MONTHLY' | 'DROP_IN'; startDays?: number; endDays?: number; paid?: boolean } = {},
  ) {
    const { planType = 'MONTHLY', startDays = -5, endDays = 24, paid = true } = opts;
    const plan = await prisma.plan.findFirstOrThrow({
      where: { type: planType, isActive: true },
    });
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/El_Salvador',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const day = (offset: number) => {
      const d = new Date(`${today}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      return d;
    };
    const membership = await prisma.membership.create({
      data: {
        memberId,
        planId: plan.id,
        planType,
        startDate: day(startDays),
        endDate: day(endDays),
        status: paid ? 'ACTIVE' : 'PENDING_PAYMENT',
        createdById: memberId,
      },
    });
    await prisma.charge.create({
      data: {
        memberId,
        type: planType === 'DROP_IN' ? 'DROP_IN' : 'MEMBERSHIP',
        concept: plan.name,
        amount: plan.price,
        dueDate: day(startDays),
        membershipId: membership.id,
        ...(paid ? { status: 'PAID' as const, paidAt: new Date() } : {}),
      },
    });
  }

  /** Miembro con una Mensual pagada y vigente: entra sin excepción (H13). */
  async function activeMember() {
    const member = await newMember();
    await giveMembership(member.id);
    return member;
  }

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
    await prisma.charge.deleteMany({ where: ofTestMembers });
    await prisma.membership.deleteMany({ where: ofTestMembers });
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
          accessAllowed: false,
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
      const member = await activeMember();
      const before = Date.now();

      const res = await checkIn(member.id);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        memberCode: member.memberCode,
        membershipStatus: 'ACTIVE',
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
      expect(saved.membershipStatus).toBe('ACTIVE');
    });

    it('un segundo ingreso dentro de 30 minutos responde 409 con el mensaje de la historia', async () => {
      const member = await activeMember();
      await checkIn(member.id);
      const res = await checkIn(member.id);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Este miembro ya registró su ingreso hace menos de 30 minutos.');
      await expect(prisma.checkIn.count({ where: { memberId: member.id } })).resolves.toBe(1);
    });

    it('un ingreso de hace 10 minutos también bloquea; uno de hace 31 minutos no', async () => {
      const recent = await activeMember();
      const old = await activeMember();
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
      const member = await activeMember();
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

  describe('Alerta de membresía no vigente · H14 (BE-14.1)', () => {
    const REASON = 'Renueva el viernes; el gerente autorizó.';

    it('accessAllowed: true con Activa, false con Vencida, Pendiente de pago o sin membresía', async () => {
      const active = await activeMember();
      const expired = await newMember();
      await giveMembership(expired.id, { startDays: -40, endDays: -11 });
      const pending = await newMember();
      await giveMembership(pending.id, { startDays: 0, endDays: 29, paid: false });
      const none = await newMember();

      const allowed = async (code: string | null) =>
        (await lookup(code as string)).body.data[0];
      expect(await allowed(active.memberCode)).toMatchObject({ membershipStatus: 'ACTIVE', accessAllowed: true });
      expect(await allowed(expired.memberCode)).toMatchObject({ membershipStatus: 'EXPIRED', accessAllowed: false });
      expect(await allowed(pending.memberCode)).toMatchObject({ membershipStatus: 'PENDING_PAYMENT', accessAllowed: false });
      expect(await allowed(none.memberCode)).toMatchObject({ membershipStatus: 'NONE', accessAllowed: false });
    });

    it('con una clase suelta de hoy accessAllowed es true y entra sin excepción', async () => {
      const member = await newMember();
      await giveMembership(member.id, { planType: 'DROP_IN', startDays: 0, endDays: 0 });

      expect((await lookup(member.memberCode as string)).body.data[0]).toMatchObject({
        membershipStatus: 'ACTIVE',
        accessAllowed: true,
      });
      const res = await checkIn(member.id);
      expect(res.status).toBe(201);
      expect(res.body.isException).toBe(false);
    });

    it('vencida sin motivo: 400 "Escribe el motivo para dejarlo pasar." y no registra el ingreso', async () => {
      const member = await newMember();
      await giveMembership(member.id, { startDays: -40, endDays: -11 });

      const res = await checkIn(member.id);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Escribe el motivo para dejarlo pasar.');
      await expect(prisma.checkIn.count({ where: { memberId: member.id } })).resolves.toBe(0);
    });

    it('un motivo de solo espacios cuenta como sin motivo', async () => {
      const member = await newMember();
      const res = await checkIn(member.id, receptionToken, { exceptionReason: '    ' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Escribe el motivo para dejarlo pasar.');
    });

    it('vencida con motivo: 201 con isException y el motivo guardado junto al ingreso', async () => {
      const member = await newMember();
      await giveMembership(member.id, { startDays: -40, endDays: -11 });

      const res = await checkIn(member.id, receptionToken, { exceptionReason: `  ${REASON}  ` });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ membershipStatus: 'EXPIRED', isException: true });
      await expect(
        prisma.checkIn.findUniqueOrThrow({ where: { id: res.body.checkInId } }),
      ).resolves.toMatchObject({ isException: true, exceptionReason: REASON, membershipStatus: 'EXPIRED' });
    });

    it('400 con un motivo de menos de 5 o más de 200 caracteres', async () => {
      const member = await newMember();
      for (const exceptionReason of ['abcd', 'x'.repeat(201)]) {
        const res = await checkIn(member.id, receptionToken, { exceptionReason });
        expect(res.status).toBe(400);
        expect(res.body.message).toEqual(['El motivo debe tener entre 5 y 200 caracteres.']);
      }
      await expect(prisma.checkIn.count({ where: { memberId: member.id } })).resolves.toBe(0);
    });

    it('con membresía Activa el motivo se ignora: no es excepción', async () => {
      const member = await activeMember();
      const res = await checkIn(member.id, receptionToken, { exceptionReason: REASON });
      expect(res.status).toBe(201);
      await expect(
        prisma.checkIn.findUniqueOrThrow({ where: { id: res.body.checkInId } }),
      ).resolves.toMatchObject({ isException: false, exceptionReason: null });
    });

    it('un miembro inexistente responde 404 aunque falte el motivo', async () => {
      expect((await checkIn(randomUUID())).status).toBe(404);
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
