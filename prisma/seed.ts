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

const USERS = [
  { email: 'admin@gymhub.test', role: 'ADMIN' },
  { email: 'recepcion@gymhub.test', role: 'RECEPTION' },
  { email: 'entrenador@gymhub.test', role: 'TRAINER' },
  { email: 'miembro@gymhub.test', role: 'MEMBER' },
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

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const user of USERS) {
    // `upsert` hace el seed idempotente: se puede correr las veces que haga falta.
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
    console.log(`${user.role.padEnd(10)} ${user.email} / ${DEMO_PASSWORD}`);
  }

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
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
