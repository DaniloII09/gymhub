import { BadRequestException, ConflictException } from '@nestjs/common';
import { ClassesController } from '@Classes/controllers';
import { ClassRepository } from '@Classes/repositories';
import { ClassesService } from './classes.service.js';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

function build(gymClass: { status: string; startsAt: Date }) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 7 }]),
    gymClass: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 7, ...gymClass }),
      update: vi.fn(),
    },
    classReservation: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const notifier = { notifyClassCancelled: vi.fn().mockResolvedValue(2) };
  const service = new ClassesService(
    new ClassRepository(prisma as never, notifier),
  );
  return { service, tx, notifier };
}

const future = () => ({
  status: 'SCHEDULED',
  startsAt: new Date(Date.now() + 24 * 60 * 60_000),
});

describe('H09. Cancelar una clase', () => {
  it('AC1: con un motivo de 5 a 200 caracteres la clase pasa a Cancelada y sale del calendario de reservas', async () => {
    const { service, tx } = build(future());

    await service.cancel(7, 'El entrenador está enfermo.');

    expect(tx.gymClass.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    await expect(service.cancel(7, 'abc')).rejects.toThrow(
      new BadRequestException('El motivo debe tener entre 5 y 200 caracteres.'),
    );
  });

  it('AC2: todas las reservas Confirmada pasan a Cancelada por el gimnasio', async () => {
    const { service, tx } = build(future());

    await expect(
      service.cancel(7, 'El entrenador está enfermo.'),
    ).resolves.toMatchObject({ reservationsCancelled: 2 });
    expect(tx.classReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classId: 7, status: 'CONFIRMED' }),
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledByGym: true,
        }),
      }),
    );
  });

  it('AC3: cada miembro con reserva recibe el aviso por el servicio de avisos', async () => {
    const { service, notifier } = build(future());

    await expect(
      service.cancel(7, 'El entrenador está enfermo.'),
    ).resolves.toMatchObject({ noticesSent: 2 });
    expect(notifier.notifyClassCancelled).toHaveBeenCalledWith(
      { classId: 7, reason: 'El entrenador está enfermo.' },
      expect.anything(),
    );
  });

  it('AC4: una clase que ya empezó o ya está Cancelada no se cancela, y muestra el motivo', async () => {
    for (const gymClass of [
      { status: 'SCHEDULED', startsAt: new Date(Date.now() - 60_000) },
      { status: 'CANCELLED', startsAt: new Date(Date.now() + 60 * 60_000) },
    ]) {
      const { service, tx } = build(gymClass);
      const attempt = service.cancel(7, 'El entrenador está enfermo.');
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toThrow(
        'Solo se puede cancelar una clase futura y programada.',
      );
      expect(tx.gymClass.update).not.toHaveBeenCalled();
    }
  });

  it('AC5: solo el Administrador puede cancelar una clase', () => {
    expect(rolesAllowed(ClassesController, 'cancel')).toEqual(['ADMIN']);
  });
});
