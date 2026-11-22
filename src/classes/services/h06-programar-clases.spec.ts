import { BadRequestException, ConflictException } from '@nestjs/common';
import { ClassesController } from '@Classes/controllers';
import {
  CLASS_DURATION_RANGE_MESSAGE,
  PAST_STARTS_AT_MESSAGE,
} from '@Classes/dto';
import {
  CapacityBelowConfirmedReservationsError,
  TrainerScheduleConflictError,
} from '@Classes/errors';
import type { ClassRepository } from '@Classes/repositories';
import { ClassesService } from './classes.service.js';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

const TRAINER_ID = '11111111-1111-4111-8111-111111111111';
const HOUR = 60 * 60_000;

/** Una fecha dentro de 7 días a la hora indicada de El Salvador (UTC-6). */
function localSchedule(hour: number, minutes: number) {
  const now = new Date();
  const startsAt = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 7,
      hour + 6,
      0,
    ),
  );
  return { startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000) };
}

function build() {
  const repository = {
    create: vi.fn(async (data) => ({
      id: 1,
      status: 'SCHEDULED',
      confirmedReservations: 0,
      trainer: { id: TRAINER_ID, fullName: 'Entrenador Demo', email: 'e@x' },
      ...data,
    })),
    update: vi.fn(),
    listByRange: vi.fn(),
  };
  return {
    repository,
    service: new ClassesService(repository as unknown as ClassRepository),
  };
}

const dto = (o: object = {}) => ({
  name: 'Funcional QA',
  trainerId: TRAINER_ID,
  ...localSchedule(18, 60),
  capacity: 3,
  ...o,
});

describe('H06. Programar las clases grupales', () => {
  it('AC1: con datos válidos la clase queda Programada y se lista en el calendario de reservas', async () => {
    const { service, repository } = build();

    const created = await service.create(dto());
    repository.listByRange.mockResolvedValue([created]);
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * HOUR);
    const forMembers = await service.list({ from, to }, {
      role: 'MEMBER',
    } as never);

    expect(created.status).toBe('SCHEDULED');
    expect(forMembers).toContainEqual(
      expect.objectContaining({ name: 'Funcional QA' }),
    );
    expect(repository.listByRange).toHaveBeenCalledWith(from, to, 'SCHEDULED');
  });

  it('AC2: el cupo se puede cambiar a un valor igual o mayor a las reservas confirmadas', async () => {
    const { service, repository } = build();
    repository.update.mockResolvedValue({
      id: 1,
      capacity: 12,
      confirmedReservations: 12,
    });

    await expect(service.update(1, { capacity: 12 })).resolves.toMatchObject({
      capacity: 12,
    });
    expect(repository.update).toHaveBeenCalledWith(1, { capacity: 12 });
  });

  it('AC3: con 12 reservas no deja bajar el cupo a 10: "El cupo no puede ser menor a las 12 reservas confirmadas."', async () => {
    const { service, repository } = build();
    repository.update.mockRejectedValue(
      new CapacityBelowConfirmedReservationsError(12),
    );

    const attempt = service.update(1, { capacity: 10 });

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(
      'El cupo no puede ser menor a las 12 reservas confirmadas.',
    );
  });

  it('AC4: rechaza inicio en el pasado y duración fuera de 30 a 180 minutos, con el motivo', async () => {
    const { service, repository } = build();
    const past = new Date(Date.now() - HOUR);

    await expect(
      service.create(
        dto({ startsAt: past, endsAt: new Date(past.getTime() + HOUR) }),
      ),
    ).rejects.toThrow(new BadRequestException(PAST_STARTS_AT_MESSAGE));
    for (const minutes of [20, 181]) {
      await expect(
        service.create(dto(localSchedule(18, minutes))),
      ).rejects.toThrow(new BadRequestException(CLASS_DURATION_RANGE_MESSAGE));
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('AC5: si el entrenador ya tiene una clase o sesión a esa hora, no lo permite e indica con cuál choca', async () => {
    const { service, repository } = build();
    const busy = localSchedule(18, 60);
    repository.create.mockRejectedValueOnce(
      new TrainerScheduleConflictError({
        kind: 'CLASS',
        id: 10,
        name: 'Spinning 18h',
        ...busy,
      }),
    );
    repository.create.mockRejectedValueOnce(
      new TrainerScheduleConflictError({
        kind: 'PERSONAL_SESSION',
        id: 42,
        ...busy,
      }),
    );

    await expect(service.create(dto())).rejects.toThrow(/Spinning 18h/);
    await expect(service.create(dto())).rejects.toThrow(/sesión personal #42/);
  });

  // Defecto abierto: el mensaje de choque muestra las horas en UTC
  // (trainer-schedule-conflict.error.ts usa getUTCHours). Una clase de 18:00
  // a 19:00 en El Salvador sale como "00:00 a 01:00". it.fails pasa mientras
  // el defecto exista; al corregirlo hay que cambiarlo a it.
  it.fails(
    'AC5 (defecto abierto): el choque indica la hora local de El Salvador',
    async () => {
      const { service, repository } = build();
      repository.create.mockRejectedValue(
        new TrainerScheduleConflictError({
          kind: 'CLASS',
          id: 10,
          name: 'Spinning 18h',
          ...localSchedule(18, 60),
        }),
      );

      await expect(service.create(dto())).rejects.toThrow('18:00 a 19:00');
    },
  );

  it('AC6: solo el Administrador puede programar o editar clases', () => {
    expect(rolesAllowed(ClassesController, 'create')).toEqual(['ADMIN']);
    expect(rolesAllowed(ClassesController, 'update')).toEqual(['ADMIN']);
    expect(rolesAllowed(ClassesController, 'replace')).toEqual(['ADMIN']);
  });
});
