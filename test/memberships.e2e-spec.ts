import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import {
  MEMBERSHIP_EXPIRY_SOURCE,
  MEMBERSHIP_STATUS_SERVICE,
  type MembershipExpirySource,
  type MembershipStatusService,
} from '@Common/contracts';
import { MembershipExpiryJob, addDays, gymToday } from '@Memberships/services';
import { PaymentGatewayService } from '@Payments/services';

/**
 * Prueba de integración de H04 (compra o renovación de membresías, estado y
 * vencimiento) contra la base de datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido.
 * Crea sus propios miembros (e2e.h04.*) y los borra al terminar con sus
 * membresías, cobros, pagos y comprobantes.
 */
const PASSWORD = 'Demo1234!';
const EMAIL_PREFIX = 'e2e.h04.';
const CLASS_PREFIX = '[e2e H04]';
const APPROVED_CARD = { cardNumber: '4242424242424242', holderName: 'Ana Pérez', expiry: '12/30', cvv: '123' };
const DECLINED_CARD = { ...APPROVED_CARD, cardNumber: '4000000000000002' };
/**
 * La clase suelta se vende para una clase de hoy que todavía no inicia. Si
 * faltan menos de 2 horas para la medianoche del gimnasio, no hay "más tarde
 * hoy" para crear clases de prueba y esas pruebas se omiten.
 */
const LATE_NIGHT = gymToday(new Date(Date.now() + 2 * 60 * 60_000)) !== gymToday();

describe('Membresías · H04 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let status: MembershipStatusService;
  let receptionToken: string;
  let memberToken: string;
  let monthlyPlanId: number;
  let dropInPlanId: number;
  const today = gymToday();

  const api = () => request(app.getHttpServer());
  const sell = (body: object, token = receptionToken) =>
    api().post('/api/v1/memberships').set('Authorization', `Bearer ${token}`).send(body);

  const dbDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  /** Miembro nuevo sin membresías. */
  async function newMember(): Promise<string> {
    const passwordHash = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@gymhub.test' } })
    ).passwordHash;
    const user = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}${randomUUID()}@gymhub.test`,
        fullName: 'Miembro H04',
        role: 'MEMBER',
        passwordHash,
      },
    });
    return user.id;
  }

  /** Membresía Mensual guardada directamente, con su cobro pagado o no. */
  async function storedMembership(
    memberId: string,
    start: string,
    end: string,
    paid: boolean,
    storedStatus: 'ACTIVE' | 'PENDING_PAYMENT' = paid ? 'ACTIVE' : 'PENDING_PAYMENT',
  ) {
    const membership = await prisma.membership.create({
      data: {
        memberId,
        planId: monthlyPlanId,
        planType: 'MONTHLY',
        startDate: dbDate(start),
        endDate: dbDate(end),
        status: storedStatus,
        createdById: memberId,
      },
    });
    await prisma.charge.create({
      data: {
        memberId,
        type: 'MEMBERSHIP',
        concept: 'Membresía Mensual',
        amount: 25,
        dueDate: dbDate(start),
        membershipId: membership.id,
        ...(paid ? { status: 'PAID' as const, paidAt: new Date() } : {}),
      },
    });
    return membership;
  }

  async function cleanUp(): Promise<void> {
    const ofTestMembers = { member: { email: { startsWith: EMAIL_PREFIX } } };
    const charges = await prisma.charge.findMany({ where: ofTestMembers, select: { id: true } });
    const chargeIds = charges.map((c) => c.id);
    await prisma.receipt.deleteMany({ where: { chargeId: { in: chargeIds } } });
    await prisma.payment.deleteMany({ where: { chargeId: { in: chargeIds } } });
    await prisma.charge.deleteMany({ where: { id: { in: chargeIds } } });
    await prisma.membership.deleteMany({ where: ofTestMembers });
    await prisma.classReservation.deleteMany({
      where: { OR: [ofTestMembers, { gymClass: { name: { startsWith: CLASS_PREFIX } } }] },
    });
    await prisma.gymClass.deleteMany({ where: { name: { startsWith: CLASS_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
    await prisma.plan.deleteMany({ where: { name: { startsWith: '[e2e] Inactivo' } } });
  }

  /** Clase programada que inicia en `minutesAhead` minutos. */
  async function newClass(minutesAhead: number, capacity = 10) {
    const trainer = await prisma.user.findUniqueOrThrow({
      where: { email: 'entrenador@gymhub.test' },
    });
    const startsAt = new Date(Date.now() + minutesAhead * 60_000);
    return prisma.gymClass.create({
      data: {
        name: `${CLASS_PREFIX} ${randomUUID().slice(0, 8)}`,
        trainerId: trainer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 50 * 60_000),
        capacity,
      },
    });
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
    status = app.get<MembershipStatusService>(MEMBERSHIP_STATUS_SERVICE);
    // Sin la espera simulada de 2 s de la pasarela.
    app.get(PaymentGatewayService).delayMs = 0;
    await cleanUp();

    const login = async (email: string) =>
      (await api().post('/api/v1/auth/login').send({ email, password: PASSWORD })).body
        .accessToken as string;
    receptionToken = await login('admin@gymhub.test');
    memberToken = await login('miembro@gymhub.test');
    monthlyPlanId = (await prisma.plan.findUniqueOrThrow({ where: { name: 'Mensual' } })).id;
    dropInPlanId = (await prisma.plan.findUniqueOrThrow({ where: { name: 'Clase suelta' } })).id;
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  describe('POST /memberships (BE-4.1)', () => {
    it('201: calcula el vencimiento, queda Pendiente de pago y crea su cobro Pendiente', async () => {
      const memberId = await newMember();

      const res = await sell({ memberId, planId: monthlyPlanId });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        plan: 'Mensual',
        planType: 'MONTHLY',
        startDate: today,
        endDate: addDays(today, 29),
        status: 'PENDING_PAYMENT',
        isRenewal: false,
        amount: 25,
      });

      const charge = await prisma.charge.findUniqueOrThrow({ where: { id: res.body.chargeId } });
      expect(charge).toMatchObject({
        memberId,
        type: 'MEMBERSHIP',
        status: 'PENDING',
        membershipId: res.body.id,
        dueDate: dbDate(today),
      });
      expect(charge.amount.toNumber()).toBe(25);
      await expect(status.currentFor(memberId)).resolves.toMatchObject({
        status: 'PENDING_PAYMENT',
      });
    });

    it('al pagar el cobro en recepción, la membresía aparece Activa', async () => {
      const memberId = await newMember();
      const sold = await sell({ memberId, planId: monthlyPlanId });

      const paid = await api()
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ chargeId: sold.body.chargeId, paymentMethod: 'CASH', idempotencyKey: randomUUID() });
      expect(paid.status).toBe(201);

      await expect(status.currentFor(memberId)).resolves.toMatchObject({
        status: 'ACTIVE',
        planName: 'Mensual',
        daysLeft: 29,
      });
    });

    it('renovar con una membresía activa inicia el día siguiente al vencimiento y no pierde días', async () => {
      const memberId = await newMember();
      const end = addDays(today, 5);
      await storedMembership(memberId, addDays(today, -24), end, true);

      const res = await sell({ memberId, planId: monthlyPlanId, startDate: today });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        startDate: addDays(end, 1),
        endDate: addDays(end, 30),
        isRenewal: true,
      });
      // La renovación sin pagar no oculta la membresía que sigue activa.
      await expect(status.currentFor(memberId)).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it('una fecha de inicio futura se respeta', async () => {
      const memberId = await newMember();
      const res = await sell({ memberId, planId: monthlyPlanId, startDate: addDays(today, 3) });
      expect(res.status).toBe(201);
      expect(res.body.startDate).toBe(addDays(today, 3));
    });

    it('409 si el miembro ya tiene una membresía pendiente de pago', async () => {
      const memberId = await newMember();
      await sell({ memberId, planId: monthlyPlanId });
      const res = await sell({ memberId, planId: monthlyPlanId });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('El miembro ya tiene una membresía pendiente de pago.');
    });

    it('dos ventas simultáneas al mismo miembro: una 201 y otra 409, con un solo cobro', async () => {
      const memberId = await newMember();
      const results = await Promise.all([
        sell({ memberId, planId: monthlyPlanId }),
        sell({ memberId, planId: monthlyPlanId }),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      await expect(prisma.charge.count({ where: { memberId } })).resolves.toBe(1);
    });

    it('400 con una fecha de inicio anterior a hoy', async () => {
      const res = await sell({
        memberId: await newMember(),
        planId: monthlyPlanId,
        startDate: addDays(today, -1),
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('La fecha de inicio no puede ser anterior a hoy.');
    });

    it('400 con el plan de clase suelta y con un plan desactivado', async () => {
      const memberId = await newMember();
      expect((await sell({ memberId, planId: dropInPlanId })).status).toBe(400);

      const inactive = await prisma.plan.create({
        data: {
          name: `[e2e] Inactivo ${randomUUID().slice(0, 8)}`,
          type: 'MONTHLY',
          durationDays: 30,
          price: 20,
          isActive: false,
        },
      });
      const res = await sell({ memberId, planId: inactive.id });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('El plan está desactivado y ya no se vende.');
    });

    it('404 si el miembro no existe o no es miembro, y si el plan no existe', async () => {
      expect((await sell({ memberId: randomUUID(), planId: monthlyPlanId })).status).toBe(404);
      const trainer = await prisma.user.findUniqueOrThrow({
        where: { email: 'entrenador@gymhub.test' },
      });
      expect((await sell({ memberId: trainer.id, planId: monthlyPlanId })).status).toBe(404);
      expect((await sell({ memberId: await newMember(), planId: 999999 })).status).toBe(404);
    });

    it('400 con datos inválidos y 403 si quien vende es un miembro', async () => {
      expect((await sell({ memberId: 'no-es-uuid', planId: monthlyPlanId })).status).toBe(400);
      expect(
        (await sell({ memberId: await newMember(), planId: monthlyPlanId, startDate: '19/11/2026' }))
          .status,
      ).toBe(400);
      expect(
        (await sell({ memberId: await newMember(), planId: monthlyPlanId }, memberToken)).status,
      ).toBe(403);
    });
  });

  describe.skipIf(LATE_NIGHT)('POST /memberships/drop-in (BE-4.2)', () => {
    const sellDropIn = (body: object) =>
      api()
        .post('/api/v1/memberships/drop-in')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ idempotencyKey: randomUUID(), ...body });

    /** Lo que quedó guardado del miembro: membresías, cobros y reservas. */
    const savedFor = async (memberId: string) => ({
      memberships: await prisma.membership.count({ where: { memberId } }),
      charges: await prisma.charge.count({ where: { memberId } }),
      reservations: await prisma.classReservation.count({ where: { memberId } }),
    });

    it('en efectivo: 201 con comprobante, membresía Activa que vence hoy, reserva y cobro pagado', async () => {
      const memberId = await newMember();
      const gymClass = await newClass(60);

      const res = await sellDropIn({ memberId, classId: gymClass.id, paymentMethod: 'CASH' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ amount: 5, endDate: today, className: gymClass.name });
      expect(res.body.receiptNumber).toMatch(/^C-\d{6}$/);

      const membership = await prisma.membership.findUniqueOrThrow({
        where: { id: res.body.membershipId },
        include: { charge: true },
      });
      expect(membership).toMatchObject({ planType: 'DROP_IN', status: 'ACTIVE' });
      expect(membership.charge).toMatchObject({ type: 'DROP_IN', status: 'PAID' });
      await expect(
        prisma.classReservation.findUniqueOrThrow({ where: { id: res.body.reservationId } }),
      ).resolves.toMatchObject({ origin: 'DROP_IN', status: 'CONFIRMED', classId: gymClass.id });

      // Mi membresía (H05) ve la clase suelta con la clase incluida.
      await expect(status.currentFor(memberId)).resolves.toMatchObject({
        status: 'ACTIVE',
        planType: 'DROP_IN',
        daysLeft: 0,
        includedClass: { name: gymClass.name, startsAt: gymClass.startsAt },
      });
    });

    it('con la tarjeta 4242: 201 y el pago guarda solo los últimos 4 dígitos', async () => {
      const memberId = await newMember();
      const gymClass = await newClass(60);
      const res = await sellDropIn({
        memberId,
        classId: gymClass.id,
        paymentMethod: 'CARD',
        card: APPROVED_CARD,
      });
      expect(res.status).toBe(201);
      const payment = await prisma.payment.findFirstOrThrow({ where: { charge: { memberId } } });
      expect(payment).toMatchObject({ method: 'CARD', result: 'APPROVED', cardLast4: '4242' });
    });

    it('con la tarjeta que rechaza: 400 con el motivo y no guarda membresía, reserva ni cobro', async () => {
      const memberId = await newMember();
      const gymClass = await newClass(60);
      const res = await sellDropIn({
        memberId,
        classId: gymClass.id,
        paymentMethod: 'CARD',
        card: DECLINED_CARD,
      });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        message: 'Fondos insuficientes',
        declineReason: 'Fondos insuficientes',
      });
      await expect(savedFor(memberId)).resolves.toEqual({
        memberships: 0,
        charges: 0,
        reservations: 0,
      });
    });

    it('con la clase llena: 409 "La clase está llena." y no cobra', async () => {
      const first = await newMember();
      const second = await newMember();
      const gymClass = await newClass(60, 1);
      expect(
        (await sellDropIn({ memberId: first, classId: gymClass.id, paymentMethod: 'CASH' })).status,
      ).toBe(201);

      const res = await sellDropIn({ memberId: second, classId: gymClass.id, paymentMethod: 'CASH' });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('La clase está llena.');
      await expect(savedFor(second)).resolves.toEqual({
        memberships: 0,
        charges: 0,
        reservations: 0,
      });
    });

    it('409 si la clase no es de hoy o si el miembro ya está en esa clase', async () => {
      const memberId = await newMember();
      const tomorrow = await newClass(26 * 60);
      const notToday = await sellDropIn({ memberId, classId: tomorrow.id, paymentMethod: 'CASH' });
      expect(notToday.status).toBe(409);
      expect(notToday.body.message).toBe('La clase suelta solo se vende para una clase de hoy.');

      const gymClass = await newClass(60);
      await sellDropIn({ memberId, classId: gymClass.id, paymentMethod: 'CASH' });
      const again = await sellDropIn({ memberId, classId: gymClass.id, paymentMethod: 'CASH' });
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('El miembro ya tiene una reserva en esa clase.');
      await expect(prisma.charge.count({ where: { memberId } })).resolves.toBe(1);
    });

    it('400 con tarjeta sin datos y 404 con una clase inexistente', async () => {
      const memberId = await newMember();
      const gymClass = await newClass(60);
      expect(
        (await sellDropIn({ memberId, classId: gymClass.id, paymentMethod: 'CARD' })).status,
      ).toBe(400);
      expect(
        (await sellDropIn({ memberId, classId: 99_999_999, paymentMethod: 'CASH' })).status,
      ).toBe(404);
    });

    it('una reserva en línea y una clase suelta por el último cupo a la vez: solo una tiene éxito y la otra no cobra', async () => {
      // Miembro con Mensual activa que reserva en línea (H07).
      const onlineMember = await newMember();
      await storedMembership(onlineMember, addDays(today, -5), addDays(today, 24), true);
      const onlineEmail = (await prisma.user.findUniqueOrThrow({ where: { id: onlineMember } }))
        .email;
      const onlineToken = (
        await api().post('/api/v1/auth/login').send({ email: onlineEmail, password: PASSWORD })
      ).body.accessToken as string;
      const dropInMember = await newMember();
      const gymClass = await newClass(60, 1);

      const [online, dropIn] = await Promise.all([
        api()
          .post(`/api/v1/classes/${gymClass.id}/reservations`)
          .set('Authorization', `Bearer ${onlineToken}`),
        sellDropIn({ memberId: dropInMember, classId: gymClass.id, paymentMethod: 'CASH' }),
      ]);

      expect([online.status, dropIn.status].sort((a, b) => a - b)).toEqual([201, 409]);
      await expect(
        prisma.classReservation.count({ where: { classId: gymClass.id, status: 'CONFIRMED' } }),
      ).resolves.toBe(1);
      if (dropIn.status === 409) {
        await expect(prisma.charge.count({ where: { memberId: dropInMember } })).resolves.toBe(0);
      }
    });
  });

  describe('Estado y vencimiento (BE-4.3)', () => {
    it('con endDate de ayer se ve Vencida sin que nadie la actualice, y la tarea la marca', async () => {
      const memberId = await newMember();
      const membership = await storedMembership(
        memberId,
        addDays(today, -30),
        addDays(today, -1),
        true,
      );

      await expect(status.currentFor(memberId)).resolves.toMatchObject({ status: 'EXPIRED' });

      await app.get(MembershipExpiryJob).handle();
      const saved = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
      expect(saved.status).toBe('EXPIRED');

      // Si corre dos veces el mismo día, la segunda no cambia nada.
      const changedAt = saved.statusChangedAt;
      await app.get(MembershipExpiryJob).handle();
      const again = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
      expect(again.statusChangedAt).toEqual(changedAt);
    });

    it('la tarea pasa a ACTIVE la membresía cuyo cobro ya se pagó', async () => {
      const memberId = await newMember();
      const membership = await storedMembership(
        memberId,
        today,
        addDays(today, 29),
        true,
        'PENDING_PAYMENT',
      );
      await app.get(MembershipExpiryJob).handle();
      await expect(
        prisma.membership.findUniqueOrThrow({ where: { id: membership.id } }),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it('un miembro sin membresías devuelve NONE', async () => {
      await expect(status.currentFor(await newMember())).resolves.toMatchObject({ status: 'NONE' });
    });

    it('MEMBERSHIP_EXPIRY_SOURCE devuelve las pagadas que vencen ese día y si ya renovaron', async () => {
      const source = app.get<MembershipExpirySource>(MEMBERSHIP_EXPIRY_SOURCE);
      const end = addDays(today, 5);
      const notRenewedMember = await newMember();
      const renewedMember = await newMember();
      const unpaidMember = await newMember();
      const notRenewed = await storedMembership(notRenewedMember, addDays(today, -24), end, true);
      const renewed = await storedMembership(renewedMember, addDays(today, -24), end, true);
      await storedMembership(renewedMember, addDays(end, 1), addDays(end, 30), false);
      await storedMembership(unpaidMember, addDays(today, -24), end, false);

      const list = await source.expiringOn(end);
      const ours = list.filter((m) =>
        [notRenewedMember, renewedMember, unpaidMember].includes(m.memberId),
      );

      expect(ours).toHaveLength(2);
      expect(ours.find((m) => m.membershipId === notRenewed.id)).toMatchObject({
        planName: 'Mensual',
        planType: 'MONTHLY',
        renewed: false,
      });
      expect(ours.find((m) => m.membershipId === renewed.id)?.renewed).toBe(true);
      expect(gymToday(ours[0].endDate)).toBe(end);
    });
  });
});
