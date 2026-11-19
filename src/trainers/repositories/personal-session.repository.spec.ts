import type { ChargesService } from '@Common/contracts';
import type { PrismaService } from '@Prisma/services';
import { PersonalSessionRepository } from './personal-session.repository.js';

const TRAINER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-18T12:00:00.000Z');

function setup(startsAt: Date, owner = TRAINER_ID) {
  const owned = owner === TRAINER_ID ? {
    id: 7,
    trainerId: TRAINER_ID,
    memberId: '22222222-2222-4222-8222-222222222222',
    startsAt,
    status: 'SCHEDULED',
    chargeId: 3,
    member: { id: '22222222-2222-4222-8222-222222222222', fullName: 'Ana', email: 'ana@example.test' },
  } : null;
  const tx = {
    personalSession: {
      findFirst: vi.fn().mockResolvedValue(owned),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    charge: { findUnique: vi.fn().mockResolvedValue({ status: 'PAID' }) },
  };
  const prisma = { $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
  const repository = new PersonalSessionRepository(
    prisma as unknown as PrismaService,
    {} as ChargesService,
  );
  return { repository, tx };
}

describe('H12 · resultado de sesión del entrenador', () => {
  it('registra Realizada al iniciar exactamente y conserva la hora y cobro', async () => {
    const { repository, tx } = setup(NOW);
    const result = await repository.markTrainerResult(7, TRAINER_ID, 'COMPLETED', NOW);
    expect(result).toMatchObject({ status: 'COMPLETED', outcome: 'COMPLETED', resultRecordedAt: NOW, chargeStatus: 'PAID' });
    expect(tx.personalSession.updateMany).toHaveBeenCalledWith({
      where: { id: 7, trainerId: TRAINER_ID, status: 'SCHEDULED' },
      data: { status: 'COMPLETED', outcome: 'COMPLETED', resultRecordedAt: NOW },
    });
  });

  it.each([
    ['2026-11-18T12:00:01.000Z', 'aún no inició'],
    ['2026-11-17T11:59:59.000Z', 'hace más de 24 horas'],
  ])('rechaza sesión %s (%s)', async (start) => {
    const { repository, tx } = setup(new Date(start));
    await expect(repository.markTrainerResult(7, TRAINER_ID, 'NO_SHOW', NOW)).resolves.toBe('INVALID_WINDOW');
    expect(tx.personalSession.updateMany).not.toHaveBeenCalled();
  });

  it('oculta sesiones de otro entrenador', async () => {
    const { repository, tx } = setup(NOW, 'another-trainer');
    await expect(repository.markTrainerResult(7, TRAINER_ID, 'NO_SHOW', NOW)).resolves.toBe('NOT_FOUND');
    expect(tx.personalSession.updateMany).not.toHaveBeenCalled();
  });
});
