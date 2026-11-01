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
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
