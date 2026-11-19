import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassNotFoundError, ClassNotScheduledError } from '@Classes/errors';
import { ClassRepository } from './class.repository.js';

describe('H09: cancelación de clase', () => {
  const future = new Date(Date.now() + 60_000);
  const tx = {
    $queryRaw: vi.fn(),
    gymClass: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    classReservation: { updateMany: vi.fn() },
  };
  const prisma = { $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  const notifier = { notifyClassCancelled: vi.fn() };
  const repository = new ClassRepository(prisma as never, notifier);

  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: 7 }]);
    tx.gymClass.findUniqueOrThrow.mockResolvedValue({ id: 7, status: 'SCHEDULED', startsAt: future });
    tx.classReservation.updateMany.mockResolvedValue({ count: 14 });
    notifier.notifyClassCancelled.mockResolvedValue(14);
  });

  it('avisa antes de cancelar 14 reservas y marca la clase', async () => {
    const order: string[] = [];
    notifier.notifyClassCancelled.mockImplementation(async () => { order.push('avisos'); return 14; });
    tx.classReservation.updateMany.mockImplementation(async () => { order.push('reservas'); return { count: 14 }; });
    tx.gymClass.update.mockImplementation(async () => { order.push('clase'); return {}; });
    await expect(repository.cancel(7, 'No hay entrenador')).resolves.toEqual({ reservationsCancelled: 14, noticesSent: 14 });
    expect(order).toEqual(['avisos', 'reservas', 'clase']);
    expect(tx.classReservation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cancelledByGym: true, status: 'CANCELLED' }) }));
  });

  it('no cambia clase ni reservas si fallan los avisos', async () => {
    notifier.notifyClassCancelled.mockRejectedValue(new Error('sin avisos'));
    await expect(repository.cancel(7, 'No hay entrenador')).rejects.toThrow('sin avisos');
    expect(tx.classReservation.updateMany).not.toHaveBeenCalled();
    expect(tx.gymClass.update).not.toHaveBeenCalled();
  });

  it('rechaza clase inexistente o iniciada', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(repository.cancel(7, 'No hay entrenador')).rejects.toBeInstanceOf(ClassNotFoundError);
    tx.gymClass.findUniqueOrThrow.mockResolvedValueOnce({ id: 7, status: 'SCHEDULED', startsAt: new Date(Date.now() - 60_000) });
    await expect(repository.cancel(7, 'No hay entrenador')).rejects.toBeInstanceOf(ClassNotScheduledError);
    expect(notifier.notifyClassCancelled).not.toHaveBeenCalled();
  });
});
