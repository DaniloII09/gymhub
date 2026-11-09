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

// Una cuenta por rol de personal para probar los guards. Sin perfil de miembro.
const STAFF = [
  { email: 'admin@gymhub.test', role: 'ADMIN', fullName: 'Admin Demo' },
  { email: 'recepcion@gymhub.test', role: 'RECEPTION', fullName: 'Recepcion Demo' },
  { email: 'entrenador@gymhub.test', role: 'TRAINER', fullName: 'Entrenador Demo' },
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

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const s of STAFF) {
    await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, role: s.role, fullName: s.fullName, passwordHash },
    });
    console.log(`${s.role.padEnd(10)} ${s.email} / ${DEMO_PASSWORD}`);
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

  await seedCharges();
  await seedGymClasses();
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

try {
  await main();
} finally {
  await prisma.$disconnect();
}