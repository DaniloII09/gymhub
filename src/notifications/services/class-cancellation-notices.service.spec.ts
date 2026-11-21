import type { NotificationService } from '@Common/contracts';
import { ClassNotFoundForNoticeError } from '@Notifications/errors';
import type { ClassCancellationRepository } from '@Notifications/repositories';
import {
  CLASS_CANCELLED_TITLE,
  ClassCancellationNoticesService,
  MESSAGE_MAX_LENGTH,
  buildClassCancelledMessage,
  formatClassDate,
  formatClassTime,
} from '@Notifications/services';
import type { Prisma } from '@PrismaClient';

const tx = {} as Prisma.TransactionClient;
// 14/11/2026 09:00 en El Salvador (UTC-6).
const STARTS_AT = new Date('2026-11-14T15:00:00.000Z');
const MEMBERS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
];

describe('buildClassCancelledMessage', () => {
  it('usa la fecha y hora del gimnasio, no la de UTC', () => {
    expect(formatClassDate(STARTS_AT)).toBe('14/11/2026');
    expect(formatClassTime(STARTS_AT)).toBe('09:00');
    // 23:30 del 14 en El Salvador ya es 15 en UTC.
    const lateClass = new Date('2026-11-15T05:30:00.000Z');
    expect(formatClassDate(lateClass)).toBe('14/11/2026');
    expect(formatClassTime(lateClass)).toBe('23:30');
  });

  it('arma el mensaje del criterio de H27', () => {
    expect(
      buildClassCancelledMessage('Yoga Flow', STARTS_AT, 'Entrenador enfermo'),
    ).toBe(
      'La clase Yoga Flow del 14/11/2026 a las 09:00 fue cancelada. Motivo: Entrenador enfermo.',
    );
  });

  it('no duplica el punto ni deja espacios si el motivo ya termina en punto', () => {
    expect(
      buildClassCancelledMessage('Spinning', STARTS_AT, '  Falla eléctrica.  '),
    ).toBe(
      'La clase Spinning del 14/11/2026 a las 09:00 fue cancelada. Motivo: Falla eléctrica.',
    );
  });

  it('con nombre de 60 y motivo de 200 recorta el motivo para no pasar de 300', () => {
    const message = buildClassCancelledMessage(
      'N'.repeat(60),
      STARTS_AT,
      'm'.repeat(200),
    );
    expect(message.length).toBe(MESSAGE_MAX_LENGTH);
    expect(message.endsWith('m….')).toBe(true);
  });

  it('un motivo que cabe no se recorta', () => {
    const message = buildClassCancelledMessage(
      'Yoga',
      STARTS_AT,
      'm'.repeat(200),
    );
    expect(message).toContain(`Motivo: ${'m'.repeat(200)}.`);
    expect(message.length).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
  });
});

describe('ClassCancellationNoticesService', () => {
  let repository: { findClassWithConfirmedMembers: ReturnType<typeof vi.fn> };
  let notifications: { notify: ReturnType<typeof vi.fn> };
  let service: ClassCancellationNoticesService;

  beforeEach(() => {
    repository = { findClassWithConfirmedMembers: vi.fn() };
    notifications = { notify: vi.fn() };
    service = new ClassCancellationNoticesService(
      repository as unknown as ClassCancellationRepository,
      notifications as unknown as NotificationService,
    );
  });

  it('avisa a los miembros con reserva confirmada por el servicio central', async () => {
    repository.findClassWithConfirmedMembers.mockResolvedValue({
      id: 42,
      name: 'Yoga Flow',
      startsAt: STARTS_AT,
      memberIds: MEMBERS,
    });
    notifications.notify.mockResolvedValue(2);

    await expect(
      service.notifyClassCancelled(
        { classId: 42, reason: 'Entrenador enfermo' },
        tx,
      ),
    ).resolves.toBe(2);

    expect(repository.findClassWithConfirmedMembers).toHaveBeenCalledWith(
      42,
      tx,
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      {
        recipients: MEMBERS,
        source: 'CLASSES',
        title: CLASS_CANCELLED_TITLE,
        message:
          'La clase Yoga Flow del 14/11/2026 a las 09:00 fue cancelada. Motivo: Entrenador enfermo.',
        referenceId: 'class:42',
      },
      tx,
    );
  });

  it('sin reservas confirmadas no crea avisos ni llama al servicio central', async () => {
    repository.findClassWithConfirmedMembers.mockResolvedValue({
      id: 7,
      name: 'Pilates',
      startsAt: STARTS_AT,
      memberIds: [],
    });

    await expect(
      service.notifyClassCancelled(
        { classId: 7, reason: 'Sin entrenador' },
        tx,
      ),
    ).resolves.toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('si la clase no existe lanza un error de dominio', async () => {
    repository.findClassWithConfirmedMembers.mockResolvedValue(null);

    await expect(
      service.notifyClassCancelled({ classId: 999, reason: 'Motivo' }, tx),
    ).rejects.toBeInstanceOf(ClassNotFoundForNoticeError);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('si el servicio central falla, el error sube para que H09 revierta', async () => {
    repository.findClassWithConfirmedMembers.mockResolvedValue({
      id: 42,
      name: 'Yoga',
      startsAt: STARTS_AT,
      memberIds: MEMBERS,
    });
    notifications.notify.mockRejectedValue(new Error('falló'));

    await expect(
      service.notifyClassCancelled({ classId: 42, reason: 'Motivo' }, tx),
    ).rejects.toThrow('falló');
  });
});
