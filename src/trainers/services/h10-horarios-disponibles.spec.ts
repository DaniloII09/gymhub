import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AvailabilityBlockRepository } from '../repositories/availability-block.repository.js';
import { AvailabilityBlocksService } from './availability-blocks.service.js';
import { generateCandidateSlotsForRange } from './trainer-calendar.js';

const TRAINER = 'entrenador-demo';

function build(
  existing: {
    id: string;
    userId: string;
    weekday: number;
    startTime: string;
    endTime: string;
  }[] = [],
) {
  const repository = {
    findByTrainerAndWeekday: vi.fn(async (userId: string, weekday: number) =>
      existing.filter((b) => b.userId === userId && b.weekday === weekday),
    ),
    findByTrainer: vi.fn(async (userId: string) =>
      existing.filter((b) => b.userId === userId),
    ),
    findById: vi.fn(
      async (id: string) => existing.find((b) => b.id === id) ?? null,
    ),
    hasFutureScheduledSessions: vi.fn().mockResolvedValue(false),
    create: vi.fn(async (userId, dto) => ({ id: 'nuevo', userId, ...dto })),
    delete: vi.fn(),
  };
  return {
    repository,
    service: new AvailabilityBlocksService(
      repository as unknown as AvailabilityBlockRepository,
    ),
  };
}

const saturday = {
  id: 'b-1',
  userId: TRAINER,
  weekday: 6,
  startTime: '08:00',
  endTime: '10:30',
};

/**
 * H10 no se terminó: no pasó QA y no está en la versión 1.0.0. Los criterios
 * que hoy fallan se escriben con it.fails: la prueba pasa mientras el defecto
 * siga abierto y avisa cuando se corrija, para cambiarla a it.
 */
describe('H10. Definir mis horarios disponibles', () => {
  it('AC1: un bloque se divide en espacios de 60 minutos y lo que sobra de menos de 60 no se ofrece', () => {
    // Sábado 28 nov 2026 en El Salvador.
    const from = new Date('2026-11-28T06:00:00.000Z');
    const to = new Date('2026-11-29T06:00:00.000Z');

    const slots = generateCandidateSlotsForRange(
      [saturday],
      from,
      to,
      new Date('2026-11-20T00:00:00Z'),
    );

    expect(slots.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
      '08:00-09:00',
      '09:00-10:00',
    ]);
  });

  it.fails(
    'AC2 (defecto abierto): rechaza un bloque de menos de 60 minutos con "El bloque debe durar al menos 60 minutos."',
    async () => {
      const { service, repository } = build();

      await expect(
        service.create(TRAINER, {
          weekday: 7,
          startTime: '10:00',
          endTime: '10:45',
        }),
      ).rejects.toThrow('El bloque debe durar al menos 60 minutos.');
      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it('AC2: rechaza un bloque cuya hora de fin es igual o anterior a la de inicio', async () => {
    const { service, repository } = build();

    await expect(
      service.create(TRAINER, {
        weekday: 1,
        startTime: '10:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('AC3: no guarda un bloque que se cruza con otro del mismo día', async () => {
    const { service, repository } = build([saturday]);

    await expect(
      service.create(TRAINER, {
        weekday: 6,
        startTime: '09:00',
        endTime: '11:00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.fails(
    'AC3 (defecto abierto): el mensaje indica con qué bloque choca',
    async () => {
      const { service } = build([saturday]);

      await expect(
        service.create(TRAINER, {
          weekday: 6,
          startTime: '09:00',
          endTime: '11:00',
        }),
      ).rejects.toThrow(/08:00/);
    },
  );

  it('AC4: no elimina un bloque con sesiones agendadas en espacios futuros', async () => {
    const { service, repository } = build([saturday]);
    repository.hasFutureScheduledSessions.mockResolvedValue(true);

    await expect(service.remove(TRAINER, 'b-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('AC5: otro entrenador solo ve y cambia sus propios bloques', async () => {
    const { service, repository } = build([saturday]);

    await expect(service.findAllByTrainer('entrenador-dos')).resolves.toEqual(
      [],
    );
    await expect(
      service.remove('entrenador-dos', 'b-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
