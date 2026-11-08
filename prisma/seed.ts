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

try {
  await main();
} finally {
  await prisma.$disconnect();
}
