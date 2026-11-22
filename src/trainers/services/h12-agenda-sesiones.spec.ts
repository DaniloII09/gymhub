import { ConflictException, NotFoundException } from '@nestjs/common';
import { PersonalSessionRepository } from '@Trainers/repositories';
import { PersonalSessionsController } from '../controllers/personal-sessions.controller.js';
import type { AvailabilityBlocksService } from './availability-blocks.service.js';
import { PersonalSessionsService } from './personal-sessions.service.js';
import type { SessionPricingService } from './session-pricing.service.js';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

const TRAINER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-18T12:00:00.000Z');
const HOUR = 60 * 60_000;

function build(sessions: object[] = []) {
  const tx = {
    personalSession: {
      findFirst: vi.fn(
        async ({ where }) =>
          sessions.find(
            (s: any) => s.id === where.id && s.trainerId === where.trainerId,
          ) ?? null,
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    charge: { findUnique: vi.fn().mockResolvedValue({ status: 'PAID' }) },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    personalSession: { findMany: vi.fn().mockResolvedValue(sessions) },
    charge: {
      findMany: vi.fn().mockResolvedValue([
        { id: 42, status: 'PENDING' },
        { id: 43, status: 'PAID' },
      ]),
    },
  };
  const service = new PersonalSessionsService(
    new PersonalSessionRepository(prisma as never, {} as never),
    {} as AvailabilityBlocksService,
    {} as SessionPricingService,
  );
  return { service, prisma, tx };
}

const session = (o: object) => ({
  id: 10,
  trainerId: TRAINER_ID,
  status: 'SCHEDULED',
  chargeId: 42,
  member: { id: 'm-1', fullName: 'Juan Perez', email: 'j@x' },
  ...o,
});

describe('H12. Consultar mi agenda de sesiones', () => {
  it('AC1: muestra las sesiones de los próximos 14 días ordenadas, con el miembro y si el cobro está Pendiente o Pagado', async () => {
    const { service, prisma } = build([
      session({
        id: 10,
        chargeId: 42,
        startsAt: new Date(NOW.getTime() + 2 * HOUR),
      }),
      session({
        id: 11,
        chargeId: 43,
        startsAt: new Date(NOW.getTime() + 5 * HOUR),
      }),
    ]);

    const agenda = await service.listTrainerAgenda(TRAINER_ID, NOW);

    const query = prisma.personalSession.findMany.mock.calls[0][0];
    expect(query.where.startsAt.lt).toEqual(
      new Date(NOW.getTime() + 14 * 24 * HOUR),
    );
    expect(query.orderBy).toEqual([{ startsAt: 'asc' }, { id: 'asc' }]);
    expect(agenda.map((s) => [s.member.fullName, s.chargeStatus])).toEqual([
      ['Juan Perez', 'PENDING'],
      ['Juan Perez', 'PAID'],
    ]);
  });

  it('AC2: una sesión que ya inició se marca Realizada o No asistió con la fecha y hora del cambio', async () => {
    const { service, tx } = build([
      session({ startsAt: new Date(NOW.getTime() - HOUR) }),
    ]);

    const marked = await service.markTrainerResult(
      10,
      TRAINER_ID,
      'NO_SHOW',
      NOW,
    );

    expect(marked).toMatchObject({ outcome: 'NO_SHOW', resultRecordedAt: NOW });
    expect(tx.personalSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'COMPLETED',
          outcome: 'NO_SHOW',
          resultRecordedAt: NOW,
        },
      }),
    );
  });

  it('AC3: no deja marcar una sesión que no ha iniciado o que inició hace más de 24 horas, y da el motivo', async () => {
    for (const startsAt of [
      new Date(NOW.getTime() + HOUR),
      new Date(NOW.getTime() - 30 * HOUR),
    ]) {
      const { service, tx } = build([session({ startsAt })]);
      const attempt = service.markTrainerResult(
        10,
        TRAINER_ID,
        'COMPLETED',
        NOW,
      );
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toThrow(
        'Solo puedes marcar el resultado desde el inicio de la sesión y hasta 24 horas después.',
      );
      expect(tx.personalSession.updateMany).not.toHaveBeenCalled();
    }
  });

  it('AC4: no deja ver ni marcar las sesiones de otro entrenador', async () => {
    const { service, prisma } = build([
      session({
        trainerId: 'entrenador-dos',
        startsAt: new Date(NOW.getTime() - HOUR),
      }),
    ]);

    await expect(
      service.markTrainerResult(10, TRAINER_ID, 'COMPLETED', NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    await service.listTrainerAgenda(TRAINER_ID, NOW);
    expect(
      prisma.personalSession.findMany.mock.calls[0][0].where.trainerId,
    ).toBe(TRAINER_ID);
    expect(
      rolesAllowed(PersonalSessionsController, 'listTrainerAgenda'),
    ).toEqual(['TRAINER']);
  });

  it('AC5: sin sesiones en el periodo la agenda llega vacía para mostrar el mensaje', async () => {
    const { service } = build([]);

    await expect(service.listTrainerAgenda(TRAINER_ID, NOW)).resolves.toEqual(
      [],
    );
  });
});
