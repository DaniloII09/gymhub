import { NotificationValidationError } from '@Notifications/errors';
import type { NotificationRepository } from '@Notifications/repositories';
import {
  MAX_RECIPIENTS,
  MESSAGE_MAX_LENGTH,
  NotificationsService,
  REFERENCE_ID_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '@Notifications/services';
import type { NotifyInput } from '@Common/contracts';
import type { Prisma } from '@PrismaClient';

const tx = {} as Prisma.TransactionClient;

/** UUID v4 distinto para cada índice. */
const userId = (i: number): string =>
  `00000000-0000-4000-8000-${i.toString().padStart(12, '0')}`;

describe('NotificationsService', () => {
  let repository: {
    countActiveUsers: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
  let service: NotificationsService;

  beforeEach(() => {
    repository = {
      // Por defecto todos los destinatarios existen y están activos.
      countActiveUsers: vi.fn((ids: string[]) => Promise.resolve(ids.length)),
      createMany: vi.fn(({ userIds }: { userIds: string[] }) =>
        Promise.resolve(userIds.length),
      ),
    };
    service = new NotificationsService(
      repository as unknown as NotificationRepository,
    );
  });

  const input = (overrides: Partial<Record<keyof NotifyInput, unknown>> = {}) =>
    ({
      recipients: [userId(1)],
      source: 'CLASSES',
      title: 'Clase cancelada',
      message: 'La clase Yoga Flow del 14/11/2026 a las 09:00 fue cancelada.',
      referenceId: '42',
      ...overrides,
    }) as NotifyInput;

  const expectRejected = async (overrides: Parameters<typeof input>[0]) => {
    await expect(service.notify(input(overrides), tx)).rejects.toBeInstanceOf(
      NotificationValidationError,
    );
    expect(repository.createMany).not.toHaveBeenCalled();
  };

  it('con 30 destinatarios crea 30 avisos y retorna 30', async () => {
    const recipients = Array.from({ length: 30 }, (_, i) => userId(i));

    await expect(service.notify(input({ recipients }), tx)).resolves.toBe(30);
    expect(repository.createMany).toHaveBeenCalledTimes(1);
    expect(repository.createMany).toHaveBeenCalledWith(
      {
        userIds: recipients,
        source: 'CLASSES',
        title: 'Clase cancelada',
        message: input().message,
        referenceId: '42',
      },
      tx,
    );
  });

  it('usa la transacción de quien llama en todas las consultas', async () => {
    await service.notify(input(), tx);

    expect(repository.countActiveUsers).toHaveBeenCalledWith([userId(1)], tx);
    expect(repository.createMany.mock.calls[0][1]).toBe(tx);
  });

  it('un destinatario repetido recibe un solo aviso', async () => {
    const recipients = [userId(1), userId(2), userId(1)];

    await expect(service.notify(input({ recipients }), tx)).resolves.toBe(2);
    expect(repository.createMany.mock.calls[0][0].userIds).toEqual([
      userId(1),
      userId(2),
    ]);
  });

  it('recorta los espacios del título, el mensaje y la referencia', async () => {
    await service.notify(
      input({ title: '  Aviso  ', message: ' Hola ', referenceId: ' 7 ' }),
      tx,
    );

    expect(repository.createMany.mock.calls[0][0]).toMatchObject({
      title: 'Aviso',
      message: 'Hola',
      referenceId: '7',
    });
  });

  it('la referencia es opcional', async () => {
    await service.notify(input({ referenceId: undefined }), tx);

    expect(repository.createMany.mock.calls[0][0].referenceId).toBeUndefined();
  });

  it('acepta los 500 destinatarios del límite', async () => {
    const recipients = Array.from({ length: MAX_RECIPIENTS }, (_, i) =>
      userId(i),
    );

    await expect(service.notify(input({ recipients }), tx)).resolves.toBe(
      MAX_RECIPIENTS,
    );
  });

  describe('no registra el aviso y lanza NotificationValidationError', () => {
    it('sin destinatarios', () => expectRejected({ recipients: [] }));

    it('sin lista de destinatarios', () =>
      expectRejected({ recipients: undefined }));

    it('con más de 500 destinatarios', () =>
      expectRejected({
        recipients: Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) =>
          userId(i),
        ),
      }));

    it('con un destinatario que no es un UUID', () =>
      expectRejected({ recipients: [userId(1), 'no-es-uuid'] }));

    it.each([undefined, '', '   '])('sin título (%j)', (title) =>
      expectRejected({ title }),
    );

    it(`con un título de más de ${TITLE_MAX_LENGTH} caracteres`, () =>
      expectRejected({ title: 'a'.repeat(TITLE_MAX_LENGTH + 1) }));

    it.each([undefined, ''])('sin mensaje (%j)', (message) =>
      expectRejected({ message }),
    );

    it(`con un mensaje de más de ${MESSAGE_MAX_LENGTH} caracteres`, () =>
      expectRejected({ message: 'a'.repeat(MESSAGE_MAX_LENGTH + 1) }));

    it.each(['ADMINISTRACION', 'classes', undefined])(
      'con un módulo de origen fuera de la lista (%j)',
      (source) => expectRejected({ source }),
    );

    it(`con una referencia de más de ${REFERENCE_ID_MAX_LENGTH} caracteres`, () =>
      expectRejected({ referenceId: 'a'.repeat(REFERENCE_ID_MAX_LENGTH + 1) }));

    it('si algún destinatario no existe o está inactivo', async () => {
      repository.countActiveUsers.mockResolvedValue(1);

      await expectRejected({ recipients: [userId(1), userId(2)] });
    });

    it('sin consultar la base si los datos ya son inválidos', async () => {
      await expectRejected({ title: '' });
      expect(repository.countActiveUsers).not.toHaveBeenCalled();
    });
  });
});
