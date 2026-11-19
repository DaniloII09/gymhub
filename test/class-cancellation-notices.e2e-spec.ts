import { Test } from '@nestjs/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import {
  CLASS_CANCELLATION_NOTIFIER,
  type ClassCancellationNotifier,
} from '@Common/contracts';
import { ClassNotFoundForNoticeError } from '@Notifications/errors';

/**
 * Prueba de integración de H27 contra la base de datos real.
 *
 * Requiere Postgres levantado y las migraciones aplicadas. Crea un entrenador,
 * 17 miembros temporales y una clase, y los borra al terminar.
 */
const EMAIL_PREFIX = 'h27-e2e-';
const CONFIRMED = 14;
const CANCELLED_BY_MEMBER = 2;
// 14/11 de un año futuro a las 09:00 en El Salvador (15:00 UTC).
const YEAR = new Date().getUTCFullYear() + 1;
const STARTS_AT = new Date(`${YEAR}-11-14T15:00:00.000Z`);
const ENDS_AT = new Date(`${YEAR}-11-14T16:00:00.000Z`);

class RollbackSignal extends Error {}

describe('Aviso de clase cancelada · H27 (e2e)', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  let notifier: ClassCancellationNotifier;
  let classId: number;
  let confirmedIds: string[];
  let cancelledIds: string[];
  let outsiderId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await moduleRef.init();
    prisma = app.get(PrismaService);
    notifier = app.get<ClassCancellationNotifier>(CLASS_CANCELLATION_NOTIFIER);

    await cleanup();

    const trainer = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}trainer@gymhub.test`,
        fullName: 'Entrenador H27',
        passwordHash: 'sin-login',
        role: 'TRAINER',
      },
    });
    const members = await prisma.user.createManyAndReturn({
      data: Array.from(
        { length: CONFIRMED + CANCELLED_BY_MEMBER + 1 },
        (_, i) => ({
          email: `${EMAIL_PREFIX}${i}@gymhub.test`,
          fullName: `Miembro H27 ${i}`,
          passwordHash: 'sin-login',
        }),
      ),
      select: { id: true, email: true },
    });
    members.sort((a, b) =>
      a.email.localeCompare(b.email, 'en', { numeric: true }),
    );
    confirmedIds = members.slice(0, CONFIRMED).map((m) => m.id);
    cancelledIds = members
      .slice(CONFIRMED, CONFIRMED + CANCELLED_BY_MEMBER)
      .map((m) => m.id);
    outsiderId = members[members.length - 1].id;

    const gymClass = await prisma.gymClass.create({
      data: {
        name: 'Yoga Flow H27',
        trainerId: trainer.id,
        startsAt: STARTS_AT,
        endsAt: ENDS_AT,
        capacity: 20,
      },
    });
    classId = gymClass.id;
    await prisma.classReservation.createMany({
      data: [
        ...confirmedIds.map((memberId) => ({ classId, memberId })),
        ...cancelledIds.map((memberId) => ({
          classId,
          memberId,
          status: 'CANCELLED' as const,
        })),
      ],
    });
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({
      where: { user: { email: { startsWith: EMAIL_PREFIX } } },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup(): Promise<void> {
    const byEmail = { email: { startsWith: EMAIL_PREFIX } };
    await prisma.notification.deleteMany({ where: { user: byEmail } });
    await prisma.classReservation.deleteMany({ where: { member: byEmail } });
    await prisma.gymClass.deleteMany({ where: { trainer: byEmail } });
    await prisma.user.deleteMany({ where: byEmail });
  }

  const noticesFor = (userIds: string[]) =>
    prisma.notification.findMany({
      where: { userId: { in: userIds }, referenceId: `class:${classId}` },
    });

  it('con 14 reservas confirmadas y 2 canceladas por el miembro envía 14 avisos', async () => {
    const created = await prisma.$transaction((tx) =>
      notifier.notifyClassCancelled(
        { classId, reason: 'Entrenador enfermo' },
        tx,
      ),
    );

    expect(created).toBe(CONFIRMED);
    const notices = await noticesFor(confirmedIds);
    expect(notices).toHaveLength(CONFIRMED);
    expect(new Set(notices.map((n) => n.userId))).toEqual(
      new Set(confirmedIds),
    );
    for (const n of notices) {
      expect(n.title).toBe('Clase cancelada');
      expect(n.source).toBe('CLASSES');
      expect(n.readAt).toBeNull();
      expect(n.message).toBe(
        `La clase Yoga Flow H27 del 14/11/${YEAR} a las 09:00 fue cancelada. Motivo: Entrenador enfermo.`,
      );
    }
  });

  it('quien canceló su reserva o no tenía reserva no recibe el aviso', async () => {
    await prisma.$transaction((tx) =>
      notifier.notifyClassCancelled({ classId, reason: 'Falla eléctrica' }, tx),
    );

    await expect(
      noticesFor([...cancelledIds, outsiderId]),
    ).resolves.toHaveLength(0);
  });

  it('si la cancelación de la clase se revierte, no queda ningún aviso', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await notifier.notifyClassCancelled(
          { classId, reason: 'Se revierte' },
          tx,
        );
        throw new RollbackSignal('H09 falló después de avisar');
      }),
    ).rejects.toBeInstanceOf(RollbackSignal);

    await expect(noticesFor(confirmedIds)).resolves.toHaveLength(0);
  });

  it('una clase que no existe lanza el error de dominio y no crea avisos', async () => {
    await expect(
      prisma.$transaction((tx) =>
        notifier.notifyClassCancelled(
          { classId: 2_000_000_000, reason: 'Motivo' },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(ClassNotFoundForNoticeError);
  });
});
