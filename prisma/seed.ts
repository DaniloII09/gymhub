import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Seed de desarrollo: una cuenta por rol para probar los permisos del guard sin
 * crear usuarios a mano. Todas comparten la contraseña a propósito: son datos
 * de desarrollo, nunca se cargan en un ambiente real.
 *
 * El rol va como string (coincide con el enum Role del schema); `as const` hace
 * que TypeScript lo valide. Los datos semilla del negocio (planes, clases de
 * ejemplo, precios) los agrega cada dueño de módulo en su rama, no este seed.
 */
const DEMO_PASSWORD = 'Demo1234!';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? DEMO_PASSWORD;
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? DEMO_PASSWORD;

// Cuentas iniciales del personal (DB-2.2): contraseña desde el entorno; recepción
// y entrenadores con cambio obligatorio. Emails en gymhub.test para no romper las
// partes del seed de otros módulos que los buscan por correo.
const STAFF = [
  { email: 'admin@gymhub.test', role: 'ADMIN', fullName: 'Admin Demo', password: ADMIN_PASSWORD },
  { email: 'recepcion@gymhub.test', role: 'RECEPTION', fullName: 'Recepcion Demo', password: STAFF_PASSWORD },
  { email: 'entrenador@gymhub.test', role: 'TRAINER', fullName: 'Entrenador Demo', password: STAFF_PASSWORD },
  { email: 'entrenador2@gymhub.test', role: 'TRAINER', fullName: 'Entrenador Dos', password: STAFF_PASSWORD },
] as const;

// Miembros de prueba (DB-1.1). Los códigos van hardcodeados acá; después se
// adelanta la secuencia para que el nextval de BE-1.1 nunca choque con ellos.
const MEMBERS = [
  { email: 'miembro@gymhub.test',       fullName: 'Juan Perez',    sex: 'M', birthDate: new Date('1998-04-12'), memberCode: 'GYM-000001' },
  { email: 'ana.gomez@gymhub.test',     fullName: 'Ana Gomez',     sex: 'F', birthDate: new Date('2001-09-30'), memberCode: 'GYM-000002' },
  { email: 'luis.martinez@gymhub.test', fullName: 'Luis Martinez', sex: 'M', birthDate: new Date('1995-01-05'), memberCode: 'GYM-000003' },
] as const;

/**
 * Inventario de máquinas (DB-20.1): 8 máquinas, 2 por área, todas operativas.
 * En esta versión no hay pantalla para dar de alta máquinas, así que el
 * inventario entra solo por este seed. Se identifican por `code`, que es único.
 */
const MACHINES = [
  { code: 'CAR-001', name: 'Caminadora 1', area: 'CARDIO' },
  { code: 'CAR-002', name: 'Bicicleta estática 1', area: 'CARDIO' },
  { code: 'FUE-001', name: 'Prensa de piernas', area: 'STRENGTH' },
  { code: 'FUE-002', name: 'Polea alta', area: 'STRENGTH' },
  { code: 'PLI-001', name: 'Banco plano con barra', area: 'FREE_WEIGHTS' },
  { code: 'PLI-002', name: 'Rack de mancuernas', area: 'FREE_WEIGHTS' },
  { code: 'FUN-001', name: 'Rack de sentadillas', area: 'FUNCTIONAL' },
  { code: 'FUN-002', name: 'Remo funcional', area: 'FUNCTIONAL' },
] as const;

/**
 * Cobros de prueba (DB-15.1) para miembro@gymhub.test: 2 pendientes y 1 pagado
 * con su comprobante. Se identifican por concepto para no duplicarlos.
 */
const CHARGES_MEMBER_EMAIL = 'miembro@gymhub.test';
const PENDING_CHARGES = [
  {
    type: 'MEMBERSHIP',
    concept: 'Membresía Mensual (prueba)',
    amount: 25,
    daysToDue: 3,
  },
  {
    type: 'PERSONAL_SESSION',
    concept: 'Sesión personal (prueba)',
    amount: 15,
    daysToDue: 5,
  },
] as const;
const PAID_CHARGE = {
  type: 'DROP_IN',
  concept: 'Clase suelta (prueba)',
  amount: 5,
} as const;
/** Clave fija del pago de prueba: hace idempotente esta parte del seed. */
const PAID_CHARGE_KEY = '00000000-0000-4000-8000-000000000015';

/**
 * Cobros vencidos de otros miembros para el listado de pagos pendientes (H17):
 * uno con 6 días de atraso y otro con más de 30 (la pantalla lo resalta).
 */
const OVERDUE_CHARGES = [
  {
    email: 'ana.gomez@gymhub.test',
    type: 'PERSONAL_SESSION',
    concept: 'Sesión personal vencida (prueba)',
    amount: 15,
    daysToDue: -6,
  },
  {
    email: 'luis.martinez@gymhub.test',
    type: 'MEMBERSHIP',
    concept: 'Membresía Trimestral vencida (prueba)',
    amount: 60,
    daysToDue: -35,
  },
] as const;

/**
 * Clases grupales de prueba (DB-6.1 / H06): 6 clases programadas en días futuros
 * asignadas a entrenador@gymhub.test. Se identifican por nombre y entrenador
 * para no duplicarlas ni borrar datos existentes al re-ejecutar el seed.
 */
const GYM_CLASSES = [
  {
    name: 'Spinning Matutino',
    daysAhead: 1,
    startHour: 7,
    durationMinutes: 60,
    capacity: 20,
  },
  {
    name: 'Yoga Flow',
    daysAhead: 1,
    startHour: 9,
    durationMinutes: 60,
    capacity: 15,
  },
  {
    name: 'CrossFit Funcional',
    daysAhead: 2,
    startHour: 18,
    durationMinutes: 60,
    capacity: 25,
  },
  {
    name: 'Pilates Core',
    daysAhead: 3,
    startHour: 8,
    durationMinutes: 45,
    capacity: 12,
  },
  {
    name: 'Boxeo Fitness',
    daysAhead: 4,
    startHour: 17,
    durationMinutes: 60,
    capacity: 20,
  },
  {
    name: 'HIIT Nocturno',
    daysAhead: 5,
    startHour: 19,
    durationMinutes: 50,
    capacity: 30,
  },
] as const;

/**
 * Avisos de prueba (DB-24.1 / H24): 3 avisos para miembro@gymhub.test, uno
 * leído, para ver la bandeja y el contador de H25 sin disparar otros módulos.
 * Se identifican por miembro y título para no duplicarlos.
 */
const NOTIFICATIONS_MEMBER_EMAIL = 'miembro@gymhub.test';
const NOTIFICATIONS = [
  {
    source: 'MEMBERSHIPS',
    title: 'Tu membresía vence pronto (prueba)',
    message: 'Tu membresía Mensual vence en 5 días. Renuévala en recepción.',
    read: false,
  },
  {
    source: 'CLASSES',
    title: 'Clase cancelada (prueba)',
    message:
      'La clase Yoga Flow del 10/11/2026 a las 09:00 fue cancelada. Motivo: entrenador enfermo.',
    read: false,
  },
  {
    source: 'PAYMENTS',
    title: 'Pago registrado (prueba)',
    message: 'Registramos tu pago de $5.00 por Clase suelta.',
    read: true,
  },
] as const;

/**
 * Planes iniciales (DB-3.1 / H03): Mensual de 30 días a $25.00, Trimestral de
 * 90 días a $65.00 y Clase suelta a $5.00, que va sin duración. Se identifican
 * por nombre, que es único.
 */
const PLANS = [
  {
    name: 'Mensual',
    type: 'MONTHLY',
    durationDays: 30,
    price: '25.00',
    benefits: 'Acceso ilimitado al área de pesas y cardio, y reserva de clases grupales.',
  },
  {
    name: 'Trimestral',
    type: 'QUARTERLY',
    durationDays: 90,
    price: '65.00',
    benefits: 'Todo lo del plan Mensual con un ahorro de $10.00 por trimestre.',
  },
  {
    name: 'Clase suelta',
    type: 'DROP_IN',
    durationDays: null,
    price: '5.00',
    benefits: 'Una clase grupal del mismo día; se paga en recepción al momento.',
  },
] as const;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const s of STAFF) {
    await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        role: s.role,
        fullName: s.fullName,
        passwordHash: await bcrypt.hash(s.password, 12),
      },
    });
    console.log(`${s.role.padEnd(10)} ${s.email}`);
  }

  for (const m of MEMBERS) {
    await prisma.user.upsert({
      where: { email: m.email },
      update: {},
      create: {
        email: m.email,
        role: 'MEMBER',
        fullName: m.fullName,
        sex: m.sex,
        birthDate: m.birthDate,
        memberCode: m.memberCode,
        enrolledAt: new Date(),
        passwordHash,
      },
    });
    console.log(`MEMBER     ${m.email} / ${DEMO_PASSWORD}  (${m.memberCode})`);
  }

  // Deja la secuencia por encima de los códigos sembrados -> el nextval de BE-1.1
  // arranca en 4. GREATEST(...) la hace segura de re-correr aunque ya existan
  // miembros reales (nunca retrocede el contador).
  await prisma.$executeRawUnsafe(
    `SELECT setval('member_code_seq', GREATEST((SELECT last_value FROM member_code_seq), 3))`,
  );
  for (const machine of MACHINES) {
    // `update: {}` no pisa el estado de una máquina que ya se usó en pruebas.
    await prisma.machine.upsert({
      where: { code: machine.code },
      update: {},
      create: machine,
    });
  }
  console.log(`${MACHINES.length} máquinas en el inventario`);

  await seedPlans();
  await seedMemberships();
  await seedCharges();
  await seedGymClasses();
  await seedPersonalSessionPricing();
  await seedNotifications();
}

async function seedPlans() {
  for (const plan of PLANS) {
    // `update: {}` no pisa un plan que el administrador ya editó o desactivó.
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {},
      create: plan,
    });
  }
  console.log(`${PLANS.length} planes iniciales (Mensual, Trimestral y Clase suelta)`);
}

/** Fecha de hoy (AAAA-MM-DD) en la zona del gimnasio, como en Pagos. */
function gymTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Fecha solo-día (columna @db.Date) a `days` días de una fecha AAAA-MM-DD. */
function gymDate(from: string, days: number): Date {
  const date = new Date(`${from}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/**
 * Membresías de prueba (DB-4.1 / H04), una por estado, cada una con su cobro:
 *   - Juan Perez: Mensual Activa, inició hace 10 días y su cobro está pagado.
 *   - Ana Gomez: Mensual Vencida hace 11 días (cobro pagado).
 *   - Luis Martinez: Trimestral Pendiente de pago desde hoy.
 * El cobro pagado lleva su pago y su comprobante, igual que PaymentRepository.
 * Solo se crea si el miembro aún no tiene membresías: correr el seed dos veces
 * no las duplica.
 */
const MEMBERSHIPS = [
  { email: 'miembro@gymhub.test', plan: 'Mensual', startsInDays: -10, paid: true, status: 'ACTIVE' },
  { email: 'ana.gomez@gymhub.test', plan: 'Mensual', startsInDays: -40, paid: true, status: 'EXPIRED' },
  { email: 'luis.martinez@gymhub.test', plan: 'Trimestral', startsInDays: 0, paid: false, status: 'PENDING_PAYMENT' },
] as const;

async function seedMemberships() {
  const today = gymTodayIso();
  const seller = await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@gymhub.test' } });

  for (const m of MEMBERSHIPS) {
    const member = await prisma.user.findUniqueOrThrow({ where: { email: m.email } });
    if ((await prisma.membership.count({ where: { memberId: member.id } })) > 0) continue;

    const plan = await prisma.plan.findUniqueOrThrow({ where: { name: m.plan } });
    const startDate = gymDate(today, m.startsInDays);
    // endDate = startDate + durationDays − 1 (último día con acceso).
    const endDate = gymDate(today, m.startsInDays + (plan.durationDays ?? 1) - 1);

    await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.create({
        data: {
          memberId: member.id,
          planId: plan.id,
          planType: plan.type,
          startDate,
          endDate,
          status: m.status,
          createdById: seller.id,
        },
      });
      const charge = await tx.charge.create({
        data: {
          memberId: member.id,
          type: 'MEMBERSHIP',
          concept: `Membresía ${plan.name}`,
          amount: plan.price,
          dueDate: startDate,
          membershipId: membership.id,
          ...(m.paid ? { status: 'PAID', paidAt: startDate } : {}),
        },
      });
      if (!m.paid) return;

      const payment = await tx.payment.create({
        data: {
          chargeId: charge.id,
          method: 'CASH',
          result: 'APPROVED',
          idempotencyKey: crypto.randomUUID(),
          registeredById: seller.id,
        },
      });
      const [{ next }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT nextval(pg_get_serial_sequence('receipts', 'id')) AS next`;
      await tx.receipt.create({
        data: {
          id: Number(next),
          number: `C-${String(next).padStart(6, '0')}`,
          paymentId: payment.id,
          chargeId: charge.id,
        },
      });
    });
  }
  console.log('membresías de prueba: una Activa, una Vencida y una Pendiente de pago');
}

async function seedCharges() {
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: CHARGES_MEMBER_EMAIL },
  });
  const today = new Date();
  const inDays = (days: number) =>
    new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + days),
    );

  for (const { daysToDue, ...charge } of PENDING_CHARGES) {
    const exists = await prisma.charge.count({
      where: { memberId: member.id, concept: charge.concept },
    });
    if (!exists) {
      await prisma.charge.create({
        data: { ...charge, memberId: member.id, dueDate: inDays(daysToDue) },
      });
    }
  }

  const alreadyPaid = await prisma.payment.count({
    where: { idempotencyKey: PAID_CHARGE_KEY },
  });
  if (!alreadyPaid) {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'recepcion@gymhub.test' },
    });
    await prisma.$transaction(async (tx) => {
      const charge = await tx.charge.create({
        data: {
          ...PAID_CHARGE,
          memberId: member.id,
          dueDate: inDays(0),
          status: 'PAID',
          paidAt: today,
        },
      });
      const payment = await tx.payment.create({
        data: {
          chargeId: charge.id,
          method: 'CASH',
          result: 'APPROVED',
          idempotencyKey: PAID_CHARGE_KEY,
          registeredById: admin.id,
        },
      });
      // Mismo criterio que PaymentRepository: el número sale del id.
      const [{ next }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT nextval(pg_get_serial_sequence('receipts', 'id')) AS next`;
      await tx.receipt.create({
        data: {
          id: Number(next),
          number: `C-${String(next).padStart(6, '0')}`,
          paymentId: payment.id,
          chargeId: charge.id,
        },
      });
    });
  }
  console.log(
    `cobros de prueba para ${CHARGES_MEMBER_EMAIL}: 2 pendientes y 1 pagado`,
  );

  for (const { email, daysToDue, ...charge } of OVERDUE_CHARGES) {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email } });
    const exists = await prisma.charge.count({
      where: { memberId: owner.id, concept: charge.concept },
    });
    if (!exists) {
      await prisma.charge.create({
        data: { ...charge, memberId: owner.id, dueDate: inDays(daysToDue) },
      });
    }
  }
  console.log(`${OVERDUE_CHARGES.length} cobros vencidos de prueba (H17)`);
  /**
   * Bloques de disponibilidad (DB-10.1 / H10): bloques de ejemplo para entrenadores.
   */
  const trainerUser = await prisma.user.findUnique({
    where: { email: 'entrenador@gymhub.test' },
  });

  if (trainerUser) {
    const availabilityBlocks = [
      { userId: trainerUser.id, weekday: 1, startTime: '08:00', endTime: '12:00' }, // Lunes
      { userId: trainerUser.id, weekday: 3, startTime: '14:00', endTime: '18:00' }, // Miércoles
      { userId: trainerUser.id, weekday: 5, startTime: '09:00', endTime: '14:00' }, // Viernes
    ];

    await prisma.availabilityBlock.createMany({
      data: availabilityBlocks,
      skipDuplicates: true,
    });

    console.log(`${availabilityBlocks.length} bloques de disponibilidad cargados`);
  }
}

async function seedGymClasses() {
  const trainer = await prisma.user.findUniqueOrThrow({
    where: { email: 'entrenador@gymhub.test' },
  });
  const now = new Date();

  for (const item of GYM_CLASSES) {
    const exists = await prisma.gymClass.count({
      where: { trainerId: trainer.id, name: item.name },
    });
    if (!exists) {
      const startsAt = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + item.daysAhead,
          item.startHour,
          0,
          0,
          0,
        ),
      );
      const endsAt = new Date(
        startsAt.getTime() + item.durationMinutes * 60_000,
      );
      await prisma.gymClass.create({
        data: {
          name: item.name,
          trainerId: trainer.id,
          startsAt,
          endsAt,
          capacity: item.capacity,
          status: 'SCHEDULED',
        },
      });
    }
  }
  console.log(`${GYM_CLASSES.length} clases grupales de prueba en el horario`);
}

/**
 * Carga idempotente del precio inicial de sesión personal (DB-11.1 / H11).
 * Solo persiste el precio si se definió explícitamente en entorno
 * (`SEED_PERSONAL_SESSION_PRICE` o `PERSONAL_SESSION_PRICE`); si negocio aún no
 * definió la tarifa oficial, no inventa ningún monto silenciosamente.
 */
async function seedPersonalSessionPricing() {
  const rawPrice =
    process.env.SEED_PERSONAL_SESSION_PRICE ?? process.env.PERSONAL_SESSION_PRICE;
  if (!rawPrice) {
    console.log(
      'precio de sesión personal no configurado (pendiente definir SEED_PERSONAL_SESSION_PRICE / PERSONAL_SESSION_PRICE)',
    );
    return;
  }

  const parsed = Number(rawPrice);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      'SEED_PERSONAL_SESSION_PRICE / PERSONAL_SESSION_PRICE debe ser un número positivo.',
    );
  }

  const price = Math.round(parsed * 100) / 100;
  await prisma.personalSessionPricing.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, price },
  });
  console.log(`precio inicial de sesión personal configurado ($${price.toFixed(2)})`);
}

async function seedNotifications() {
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: NOTIFICATIONS_MEMBER_EMAIL },
  });

  for (const { read, ...notification } of NOTIFICATIONS) {
    const exists = await prisma.notification.count({
      where: { userId: member.id, title: notification.title },
    });
    if (exists > 0) continue;
    await prisma.notification.create({
      data: {
        ...notification,
        userId: member.id,
        readAt: read ? new Date() : null,
      },
    });
  }
  console.log(
    `${NOTIFICATIONS.length} avisos de prueba para ${NOTIFICATIONS_MEMBER_EMAIL}`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}