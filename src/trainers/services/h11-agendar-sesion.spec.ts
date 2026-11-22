import { BadRequestException, ConflictException } from '@nestjs/common';
import { SessionSlotAlreadyTakenError } from '@Trainers/errors';
import type { PersonalSessionRepository } from '@Trainers/repositories';
import { PersonalSessionsController } from '../controllers/personal-sessions.controller.js';
import type { AvailabilityBlocksService } from './availability-blocks.service.js';
import { PersonalSessionsService } from './personal-sessions.service.js';
import type { SessionPricingService } from './session-pricing.service.js';

const TRAINER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
// Domingo 22 nov 2026 00:00 en El Salvador.
const NOW = new Date('2026-11-22T06:00:00.000Z');
// Lunes 23 nov 2026 09:00 en El Salvador.
const MONDAY_9 = new Date('2026-11-23T15:00:00.000Z');

function build() {
  const repository = {
    findTrainerById: vi
      .fn()
      .mockResolvedValue({
        id: TRAINER_ID,
        fullName: 'Entrenador Demo',
        email: 'e@x',
        role: 'TRAINER',
        isActive: true,
      }),
    findScheduledConflictsForTrainer: vi
      .fn()
      .mockResolvedValue({ sessions: [], classes: [] }),
    book: vi.fn(async (data) => ({
      id: 1,
      status: 'SCHEDULED',
      chargeStatus: 'PENDING',
      chargeId: 42,
      ...data,
    })),
  };
  const blocks = {
    findAllByTrainer: vi
      .fn()
      .mockResolvedValue([
        { id: 'b-1', weekday: 1, startTime: '08:00', endTime: '11:00' },
      ]),
  };
  const pricing = { requireConfiguredPrice: vi.fn().mockResolvedValue(15) };
  const service = new PersonalSessionsService(
    repository as unknown as PersonalSessionRepository,
    blocks as unknown as AvailabilityBlocksService,
    pricing as unknown as SessionPricingService,
  );
  return { service, repository };
}

describe('H11. Agendar una sesión con un entrenador', () => {
  it('AC1: muestra espacios libres de 60 minutos de 14 días, sin los tomados ni los que se cruzan con sus clases', async () => {
    const { service, repository } = build();
    repository.findScheduledConflictsForTrainer.mockResolvedValue({
      sessions: [
        {
          startsAt: new Date('2026-11-23T14:00:00Z'),
          endsAt: new Date('2026-11-23T15:00:00Z'),
        },
      ],
      classes: [
        {
          startsAt: new Date('2026-11-23T16:00:00Z'),
          endsAt: new Date('2026-11-23T16:50:00Z'),
        },
      ],
    });

    const result = await service.listAvailableSlots(TRAINER_ID, undefined, NOW);

    expect(result.to.getTime() - result.from.getTime()).toBe(
      14 * 24 * 60 * 60_000,
    );
    const monday = result.slots
      .filter((s) => s.date === '2026-11-23')
      .map((s) => s.startTime);
    expect(monday).toEqual(['09:00']);
  });

  it('AC2: con 12 horas o más agenda la sesión, queda Agendada con el monto y deja de ofrecerse a otros', async () => {
    const { service, repository } = build();

    const session = await service.book(
      MEMBER_ID,
      { trainerId: TRAINER_ID, startsAt: MONDAY_9 },
      NOW,
    );

    expect(session).toMatchObject({ status: 'SCHEDULED', price: 15 });
    repository.findScheduledConflictsForTrainer.mockResolvedValue({
      sessions: [
        { startsAt: MONDAY_9, endsAt: new Date('2026-11-23T16:00:00Z') },
      ],
      classes: [],
    });
    const forOthers = await service.listAvailableSlots(
      TRAINER_ID,
      undefined,
      NOW,
    );
    expect(
      forOthers.slots.some((s) => s.startsAt.getTime() === MONDAY_9.getTime()),
    ).toBe(false);
  });

  it('AC3: al agendar se crea un cobro Pendiente por el monto de la sesión', async () => {
    const { service, repository } = build();

    const session = await service.book(
      MEMBER_ID,
      { trainerId: TRAINER_ID, startsAt: MONDAY_9 },
      NOW,
    );

    expect(repository.book).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 15,
        concept: 'Sesión personal (2026-11-23 09:00) - Entrenador Demo',
      }),
    );
    expect(session).toMatchObject({ chargeStatus: 'PENDING', chargeId: 42 });
  });

  it('AC4: si dos miembros agendan el mismo espacio a la vez, el segundo ve "Ese horario ya fue tomado."', async () => {
    const { service, repository } = build();
    repository.book.mockImplementationOnce(async (data) => ({
      id: 1,
      status: 'SCHEDULED',
      ...data,
    }));
    repository.book.mockRejectedValueOnce(new SessionSlotAlreadyTakenError());

    const [first, second] = await Promise.allSettled([
      service.book(
        MEMBER_ID,
        { trainerId: TRAINER_ID, startsAt: MONDAY_9 },
        NOW,
      ),
      service.book(
        'otro-miembro',
        { trainerId: TRAINER_ID, startsAt: MONDAY_9 },
        NOW,
      ),
    ]);

    expect(first.status).toBe('fulfilled');
    const error = (second as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('Ese horario ya fue tomado.');
  });

  it('AC5: con menos de 12 horas no agenda: "Las sesiones se agendan con al menos 12 horas de anticipación."', async () => {
    const { service, repository } = build();
    const elevenHoursBefore = new Date(MONDAY_9.getTime() - 11 * 60 * 60_000);

    const attempt = service.book(
      MEMBER_ID,
      { trainerId: TRAINER_ID, startsAt: MONDAY_9 },
      elevenHoursBefore,
    );

    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(attempt).rejects.toThrow(
      'Las sesiones se agendan con al menos 12 horas de anticipación.',
    );
    expect(repository.book).not.toHaveBeenCalled();
  });

  it('AC6: el miembro no tiene forma de cancelar una sesión personal', () => {
    const methods = Object.getOwnPropertyNames(
      PersonalSessionsController.prototype,
    );
    expect(methods.some((name) => /cancel/i.test(name))).toBe(false);
  });
});
