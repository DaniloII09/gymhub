import { ConflictException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@PrismaClient';
import { ReviewsController } from '@Reviews/controllers';
import {
  CreateReviewDto,
  REVIEW_COMMENT_MAX_MESSAGE,
  REVIEW_RATING_MESSAGE,
} from '@Reviews/dto';
import { ReviewRepository } from '@Reviews/repositories';
import { ReviewsService } from '@Reviews/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const TRAINER = {
  id: '44444444-4444-4444-8444-444444444444',
  fullName: 'Carlos Entrenador',
};
/** Hora de El Salvador (UTC-6). */
const sv = (local: string) => new Date(`${local}-06:00`);

// Spinning del 18 nov, 18:00 a 19:00, y sesión personal del mismo día, 07:00 a 08:00.
const gymClass = {
  id: 4,
  name: 'Spinning',
  status: 'SCHEDULED',
  startsAt: sv('2026-11-18T18:00:00'),
  endsAt: sv('2026-11-18T19:00:00'),
  trainer: TRAINER,
};
const session = (overrides: object = {}) => ({
  id: 9,
  memberId: MEMBER_ID,
  status: 'COMPLETED',
  outcome: 'COMPLETED',
  startsAt: sv('2026-11-18T07:00:00'),
  endsAt: sv('2026-11-18T08:00:00'),
  trainer: TRAINER,
  ...overrides,
});

/** Repositorio real sobre una base en memoria con la clase, la sesión, los ingresos y las reseñas. */
function fixture({
  checkIns = [sv('2026-11-18T17:30:00')],
  sessions = [session()],
} = {}) {
  const reviews: Record<string, unknown>[] = [];
  const inRange = (d: Date, r: { gte?: Date; lte?: Date }) =>
    (!r.gte || d >= r.gte) && (!r.lte || d <= r.lte);
  const reviewed = (key: 'gymClassId' | 'personalSessionId', id: number) =>
    reviews.some((r) => r.memberId === MEMBER_ID && r[key] === id);
  const findCheckIns = async ({
    where,
  }: {
    where: { checkedInAt: { gte: Date; lte: Date } };
  }) =>
    checkIns
      .filter((d) => inRange(d, where.checkedInAt))
      .map((checkedInAt) => ({ checkedInAt }));

  const tx = {
    gymClass: {
      findUnique: vi.fn(async ({ where }) =>
        where.id === gymClass.id ? gymClass : null,
      ),
    },
    classReservation: { findFirst: vi.fn(async () => ({ id: 87 })) },
    personalSession: {
      findFirst: vi.fn(
        async ({ where }) => sessions.find((s) => s.id === where.id) ?? null,
      ),
    },
    checkIn: { findMany: vi.fn(findCheckIns) },
    review: {
      findUnique: vi.fn(async ({ where }) => {
        const key = where.memberId_gymClassId
          ? reviewed('gymClassId', where.memberId_gymClassId.gymClassId)
          : reviewed(
              'personalSessionId',
              where.memberId_personalSessionId.personalSessionId,
            );
        return key ? { id: 1 } : null;
      }),
      create: vi.fn(async ({ data }) => {
        const row = {
          id: reviews.length + 1,
          createdAt: new Date(),
          comment: null,
          ...data,
        };
        reviews.push(row);
        return row;
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    classReservation: {
      findMany: vi.fn(async ({ where }) =>
        inRange(gymClass.endsAt, where.gymClass.endsAt) &&
        !reviewed('gymClassId', gymClass.id)
          ? [{ gymClass }]
          : [],
      ),
    },
    personalSession: {
      findMany: vi.fn(async ({ where }) =>
        sessions.filter(
          (s) =>
            s.status === where.status &&
            s.outcome === where.outcome &&
            inRange(s.endsAt, where.endsAt) &&
            !reviewed('personalSessionId', s.id),
        ),
      ),
    },
    checkIn: { findMany: vi.fn(findCheckIns) },
  };
  return {
    reviews,
    service: new ReviewsService(new ReviewRepository(prisma as never)),
  };
}

const pendingIds = async (service: ReviewsService, now: Date) =>
  (await service.listPending(MEMBER_ID, now)).map(
    (p) => `${p.targetType}:${p.targetId}`,
  );

describe('H22. Calificar una clase o sesión que tomé', () => {
  it('AC1: una clase reservada con ingreso ese día antes de terminar está en "Por calificar" 7 días', async () => {
    const { service } = fixture({ sessions: [] });

    expect(await pendingIds(service, sv('2026-11-18T18:59:00'))).toEqual([]); // aún no termina
    expect(await pendingIds(service, sv('2026-11-18T19:00:00'))).toEqual([
      'CLASS:4',
    ]);
    expect(await pendingIds(service, sv('2026-11-25T23:59:00'))).toEqual([
      'CLASS:4',
    ]); // día 7
    expect(await pendingIds(service, sv('2026-11-26T00:01:00'))).toEqual([]);

    const [item] = await service.listPending(
      MEMBER_ID,
      sv('2026-11-19T12:00:00'),
    );
    expect(item).toMatchObject({
      title: 'Spinning',
      trainerName: TRAINER.fullName,
      reviewDeadline: '2026-11-25',
    });
  });

  it('AC2: una sesión personal marcada "Realizada" está en "Por calificar" 7 días', async () => {
    const { service } = fixture({ checkIns: [] });

    expect(await pendingIds(service, sv('2026-11-18T08:00:00'))).toEqual([
      'PERSONAL_SESSION:9',
    ]);
    expect(await pendingIds(service, sv('2026-11-25T23:00:00'))).toEqual([
      'PERSONAL_SESSION:9',
    ]);
    expect(await pendingIds(service, sv('2026-11-26T08:00:00'))).toEqual([]);
  });

  it('AC3: de 1 a 5 estrellas y comentario opcional de hasta 500 caracteres se guarda y sale de la lista', async () => {
    const messages = async (plain: object) =>
      (await validate(plainToInstance(CreateReviewDto, plain))).flatMap((e) =>
        Object.values(e.constraints ?? {}),
      );
    const base = { targetType: 'CLASS', targetId: 4 };
    expect(await messages({ ...base, rating: 1 })).toEqual([]);
    expect(
      await messages({ ...base, rating: 5, comment: 'x'.repeat(500) }),
    ).toEqual([]);
    expect(await messages({ ...base, rating: 0 })).toEqual([
      REVIEW_RATING_MESSAGE,
    ]);
    expect(await messages({ ...base, rating: 6 })).toEqual([
      REVIEW_RATING_MESSAGE,
    ]);
    expect(
      await messages({ ...base, rating: 4, comment: 'x'.repeat(501) }),
    ).toEqual([REVIEW_COMMENT_MAX_MESSAGE]);

    const { service, reviews } = fixture();
    const now = sv('2026-11-19T12:00:00');
    expect(await pendingIds(service, now)).toEqual([
      'CLASS:4',
      'PERSONAL_SESSION:9',
    ]);

    const saved = await service.create(
      MEMBER_ID,
      { targetType: 'CLASS', targetId: 4, rating: 5, comment: 'Excelente' },
      now,
    );
    await service.create(
      MEMBER_ID,
      { targetType: 'PERSONAL_SESSION', targetId: 9, rating: 4 },
      now,
    );

    expect(saved).toMatchObject({
      rating: 5,
      comment: 'Excelente',
      title: 'Spinning',
    });
    expect(reviews).toHaveLength(2);
    expect(await pendingIds(service, now)).toEqual([]);
  });

  it('AC4: una sesión "No asistió" no se califica: "Solo puedes calificar sesiones que se realizaron."', async () => {
    const { service, reviews } = fixture({
      sessions: [session({ outcome: 'NO_SHOW' })],
    });
    const now = sv('2026-11-19T12:00:00');

    expect(await pendingIds(service, now)).not.toContain('PERSONAL_SESSION:9');
    await expect(
      service.create(
        MEMBER_ID,
        { targetType: 'PERSONAL_SESSION', targetId: 9, rating: 3 },
        now,
      ),
    ).rejects.toThrow(
      new ForbiddenException(
        'Solo puedes calificar sesiones que se realizaron.',
      ),
    );
    expect(reviews).toHaveLength(0);
  });

  it('AC5: una clase sin ingreso ese día no se califica: "Solo puedes calificar clases a las que asististe."', async () => {
    // Ingresó el día anterior y otro después de que terminó la clase: ninguno cuenta.
    const { service, reviews } = fixture({
      checkIns: [sv('2026-11-17T18:00:00'), sv('2026-11-18T19:30:00')],
      sessions: [],
    });
    const now = sv('2026-11-19T12:00:00');

    expect(await pendingIds(service, now)).toEqual([]);
    await expect(
      service.create(
        MEMBER_ID,
        { targetType: 'CLASS', targetId: 4, rating: 3 },
        now,
      ),
    ).rejects.toThrow(
      new ConflictException(
        'Solo puedes calificar clases a las que asististe.',
      ),
    );
    expect(reviews).toHaveLength(0);
  });

  it('AC6: calificar otra vez muestra "Ya calificaste esta clase o sesión."', async () => {
    const { service, reviews } = fixture();
    const now = sv('2026-11-19T12:00:00');
    await service.create(
      MEMBER_ID,
      { targetType: 'CLASS', targetId: 4, rating: 5 },
      now,
    );
    await service.create(
      MEMBER_ID,
      { targetType: 'PERSONAL_SESSION', targetId: 9, rating: 5 },
      now,
    );

    const again = new ConflictException('Ya calificaste esta clase o sesión.');
    await expect(
      service.create(
        MEMBER_ID,
        { targetType: 'CLASS', targetId: 4, rating: 1 },
        now,
      ),
    ).rejects.toThrow(again);
    await expect(
      service.create(
        MEMBER_ID,
        { targetType: 'PERSONAL_SESSION', targetId: 9, rating: 1 },
        now,
      ),
    ).rejects.toThrow(again);
    expect(reviews).toHaveLength(2);
    expect(rolesAllowed(ReviewsController, 'create')).toEqual(['MEMBER']);
  });

  it('AC6: dos envíos simultáneos chocan con el índice único y también responden "Ya calificaste…"', async () => {
    const repository = {
      createReview: vi
        .fn()
        .mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        ),
    };
    // El repositorio real traduce el P2002; aquí se prueba con un prisma que lo lanza.
    const prisma = { $transaction: repository.createReview };
    const service = new ReviewsService(new ReviewRepository(prisma as never));
    await expect(
      service.create(
        MEMBER_ID,
        { targetType: 'CLASS', targetId: 4, rating: 5 },
        new Date(),
      ),
    ).rejects.toThrow(
      new ConflictException('Ya calificaste esta clase o sesión.'),
    );
  });
});
