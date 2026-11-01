import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Seed de desarrollo: una cuenta por rol para poder probar los permisos de
 * cada módulo sin tener que crear usuarios a mano.
 *
 * Todas comparten la misma contraseña a propósito: son datos de desarrollo,
 * nunca se cargan en un ambiente real.
 */
const DEMO_PASSWORD = 'Demo1234!';

const USERS = [
  { email: 'admin@gymhub.test', fullName: 'Admin Demo', role: 'ADMIN' },
  { email: 'recepcion@gymhub.test', fullName: 'Recepción Demo', role: 'RECEPTIONIST' },
  { email: 'entrenador@gymhub.test', fullName: 'Entrenador Demo', role: 'TRAINER' },
  {
    email: 'miembro@gymhub.test',
    fullName: 'Miembro Demo',
    role: 'MEMBER',
    memberCode: 'M-0001',
  },
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
    console.log(`${user.role.padEnd(12)} ${user.email} / ${DEMO_PASSWORD}`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
