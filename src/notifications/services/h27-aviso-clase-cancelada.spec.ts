import { ClassRepository } from '@Classes/repositories';
import { ClassReservationResponseDto } from '@Classes/dto';
import { ClassCancellationRepository } from '@Notifications/repositories';
import {
  CLASS_CANCELLED_TITLE,
  ClassCancellationNoticesService,
} from '@Notifications/services';
import {
  notificationFixture,
  uuid,
} from '../../../test/helpers/notification-fixture.js';

// 19 nov 2026, 06:00 en El Salvador; la clase es ese día a las 18:00.
const NOW = new Date('2026-11-19T12:00:00.000Z');
const STARTS_AT = new Date('2026-11-20T00:00:00.000Z');
const CONFIRMED = uuid(1);
const SELF_CANCELLED = uuid(2);
const NO_RESERVATION = uuid(3);
const TRAINER = { id: uuid(9), fullName: 'Carlos Entrenador' };

/**
 * Cancelación real de H09 (ClassRepository.cancel) con el aviso real de H27 y
 * el servicio real de avisos de H24, sobre tablas en memoria.
 */
function fixture() {
  const n = notificationFixture();
  const gymClass = {
    id: 4,
    name: 'Spinning',
    status: 'SCHEDULED',
    startsAt: STARTS_AT,
    trainerId: TRAINER.id,
    trainer: TRAINER,
  };
  const reservations = [
    {
      id: 1,
      classId: 4,
      memberId: CONFIRMED,
      status: 'CONFIRMED',
      origin: 'ONLINE',
      cancelledAt: null,
      cancelledByGym: false,
      createdAt: NOW,
    },
    {
      id: 2,
      classId: 4,
      memberId: SELF_CANCELLED,
      status: 'CANCELLED',
      origin: 'ONLINE',
      cancelledAt: NOW,
      cancelledByGym: false,
      createdAt: NOW,
    },
  ];
  const tx = {
    ...n.tx,
    $queryRaw: vi.fn(async () => [{ id: 4 }]),
    gymClass: {
      findUniqueOrThrow: vi.fn(async () => gymClass),
      // Lectura de H27: la clase con sus reservas confirmadas.
      findUnique: vi.fn(async ({ select }) => ({
        id: gymClass.id,
        name: gymClass.name,
        startsAt: gymClass.startsAt,
        reservations: reservations
          .filter((r) => r.status === select.reservations.where.status)
          .map((r) => ({ memberId: r.memberId })),
      })),
      update: vi.fn(async ({ data }) => Object.assign(gymClass, data)),
    },
    classReservation: {
      updateMany: vi.fn(async ({ where, data }) => {
        const hit = reservations.filter(
          (r) => r.classId === where.classId && r.status === where.status,
        );
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const notifier = new ClassCancellationNoticesService(
    new ClassCancellationRepository(),
    n.notifications,
  );
  const classes = new ClassRepository(prisma as never, notifier);
  return {
    classes,
    reservations,
    gymClass,
    inboxOf: async (userId: string) => (await n.inbox.list(userId, 1)).data,
  };
}

describe('H27. Enterarme si cancelan una clase que reservé', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('AC1: con reserva Confirmada recibo "Clase cancelada" con nombre, fecha, hora y motivo', async () => {
    const { classes, inboxOf } = fixture();

    const result = await classes.cancel(4, 'El entrenador está enfermo.');

    expect(result).toEqual({ reservationsCancelled: 1, noticesSent: 1 });
    expect(CLASS_CANCELLED_TITLE).toBe('Clase cancelada');
    expect(await inboxOf(CONFIRMED)).toEqual([
      expect.objectContaining({
        title: 'Clase cancelada',
        message:
          'La clase Spinning del 19/11/2026 a las 18:00 fue cancelada. Motivo: El entrenador está enfermo.',
        source: 'CLASSES',
        referenceId: 'class:4',
      }),
    ]);
  });

  it('AC2: en Mis reservas la reserva aparece cancelada por el gimnasio', async () => {
    const { classes, reservations, gymClass } = fixture();
    await classes.cancel(4, 'El entrenador está enfermo.');

    const dto = ClassReservationResponseDto.fromEntity({
      ...reservations[0],
      gymClass,
    } as never);
    expect(dto).toMatchObject({ status: 'CANCELLED', cancelledByGym: true });
    // La que el miembro canceló antes no se marca como cancelada por el gimnasio.
    expect(reservations[1]).toMatchObject({
      status: 'CANCELLED',
      cancelledByGym: false,
    });
  });

  it('AC3: sin reserva en la clase o con la reserva ya cancelada no recibo el aviso', async () => {
    const { classes, inboxOf } = fixture();
    await classes.cancel(4, 'El entrenador está enfermo.');

    expect(await inboxOf(SELF_CANCELLED)).toEqual([]);
    expect(await inboxOf(NO_RESERVATION)).toEqual([]);
  });
});
