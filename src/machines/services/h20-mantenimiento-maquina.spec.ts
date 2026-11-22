import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MachinesController } from '@Machines/controllers';
import {
  ChangeMachineStatusDto,
  MachineStatusChangeResponseDto,
  MachineStatusHistoryEntryDto,
  MISSING_REASON_MESSAGE,
  REASON_LENGTH_MESSAGE,
} from '@Machines/dto';
import { MachineRepository } from '@Machines/repositories';
import {
  MACHINE_ALREADY_IN_STATUS_MESSAGE,
  MachinesService,
} from '@Machines/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

const ADMIN = {
  id: '99999999-9999-4999-8999-999999999999',
  email: 'admin@gymhub.test',
  fullName: 'Administrador GymHub',
};

/** Repositorio real sobre una base en memoria: una máquina y su historial. */
function fixture(status = 'OPERATIONAL') {
  const machine = { id: 1, name: 'Caminadora 1', area: 'CARDIO', status };
  const changes: Record<string, unknown>[] = [];
  let clock = Date.parse('2026-11-19T15:00:00.000Z');
  // Devuelve del autor solo los campos que pide el `select` del include.
  const author = (include: {
    changedBy: { select: Record<string, boolean> };
  }) =>
    Object.fromEntries(
      Object.keys(include.changedBy.select).map((k) => [
        k,
        ADMIN[k as keyof typeof ADMIN],
      ]),
    );
  const tx = {
    machine: {
      findUnique: vi.fn(async () => ({ status: machine.status })),
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.status !== machine.status) return { count: 0 };
        machine.status = data.status;
        return { count: 1 };
      }),
    },
    machineStatusChange: {
      create: vi.fn(async ({ data, include }) => {
        const row = {
          id: changes.length + 1,
          changedAt: new Date((clock += 60_000)),
          ...data,
        };
        changes.push(row);
        return { ...row, changedBy: author(include) };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    machine: { count: vi.fn().mockResolvedValue(1) },
    machineStatusChange: {
      findMany: vi.fn(async ({ include }) =>
        [...changes]
          .sort(
            (a, b) =>
              (b.changedAt as Date).getTime() - (a.changedAt as Date).getTime(),
          )
          .map((c) => ({ ...c, changedBy: author(include) })),
      ),
    },
  };
  const service = new MachinesService(new MachineRepository(prisma as never));
  return { machine, changes, service };
}

const dto = (status: string, reason: string) =>
  plainToInstance(ChangeMachineStatusDto, { status, reason });
const messagesOf = async (plain: object) =>
  (await validate(plainToInstance(ChangeMachineStatusDto, plain))).flatMap(
    (e) => Object.values(e.constraints ?? {}),
  );

describe('H20. Registrar el mantenimiento de una máquina', () => {
  it('AC1: el cambio de estado con motivo de 5 a 200 caracteres se guarda con fecha y hora', async () => {
    expect(
      await messagesOf({ status: 'UNDER_MAINTENANCE', reason: 'Banda' }),
    ).toEqual([]);
    expect(
      await messagesOf({ status: 'OUT_OF_SERVICE', reason: 'x'.repeat(200) }),
    ).toEqual([]);
    expect(await messagesOf({ status: 'OPERATIONAL', reason: 'Fix' })).toEqual([
      REASON_LENGTH_MESSAGE,
    ]);
    expect(
      await messagesOf({ status: 'OPERATIONAL', reason: 'x'.repeat(201) }),
    ).toEqual([REASON_LENGTH_MESSAGE]);

    const { machine, changes, service } = fixture();
    const change = await service.changeStatus(
      1,
      dto('UNDER_MAINTENANCE', 'Banda desgastada'),
      ADMIN.id,
    );

    expect(machine.status).toBe('UNDER_MAINTENANCE');
    expect(changes[0]).toMatchObject({
      fromStatus: 'OPERATIONAL',
      toStatus: 'UNDER_MAINTENANCE',
      reason: 'Banda desgastada',
      changedById: ADMIN.id,
    });
    expect(
      MachineStatusChangeResponseDto.fromEntity(change).changedAt,
    ).toBeInstanceOf(Date);
  });

  // Defecto abierto: la respuesta y el historial muestran el correo del
  // administrador, no su nombre (machine-status-change-response.dto.ts).
  it.fails('AC1: el cambio queda con el nombre de quien lo hizo', async () => {
    const { service } = fixture();
    const change = await service.changeStatus(
      1,
      dto('UNDER_MAINTENANCE', 'Banda desgastada'),
      ADMIN.id,
    );

    expect(MachineStatusChangeResponseDto.fromEntity(change).changedBy).toBe(
      ADMIN.fullName,
    );
  });

  it('AC2: el historial muestra todos los cambios del más reciente al más antiguo', async () => {
    const { service } = fixture();
    await service.changeStatus(
      1,
      dto('UNDER_MAINTENANCE', 'Banda desgastada'),
      ADMIN.id,
    );
    await service.changeStatus(
      1,
      dto('OUT_OF_SERVICE', 'Motor quemado'),
      ADMIN.id,
    );
    await service.changeStatus(
      1,
      dto('OPERATIONAL', 'Motor reemplazado'),
      ADMIN.id,
    );

    const history = (await service.history(1)).map((c) =>
      MachineStatusHistoryEntryDto.fromEntity(c),
    );

    expect(history.map((h) => [h.fromStatus, h.toStatus, h.reason])).toEqual([
      ['OUT_OF_SERVICE', 'OPERATIONAL', 'Motor reemplazado'],
      ['UNDER_MAINTENANCE', 'OUT_OF_SERVICE', 'Motor quemado'],
      ['OPERATIONAL', 'UNDER_MAINTENANCE', 'Banda desgastada'],
    ]);
  });

  it('AC3: sin motivo (o solo espacios) no se guarda y muestra "Escribe el motivo del cambio."', async () => {
    expect(MISSING_REASON_MESSAGE).toBe('Escribe el motivo del cambio.');
    expect(await messagesOf({ status: 'OUT_OF_SERVICE' })).toEqual([
      MISSING_REASON_MESSAGE,
    ]);
    expect(await messagesOf({ status: 'OUT_OF_SERVICE', reason: '' })).toEqual([
      MISSING_REASON_MESSAGE,
    ]);
    expect(
      await messagesOf({ status: 'OUT_OF_SERVICE', reason: '     ' }),
    ).toEqual([MISSING_REASON_MESSAGE]);
  });

  it('AC4: el mismo estado que ya tiene muestra "La máquina ya está en ese estado."', async () => {
    const { changes, service } = fixture('UNDER_MAINTENANCE');

    await expect(
      service.changeStatus(
        1,
        dto('UNDER_MAINTENANCE', 'Otra revisión'),
        ADMIN.id,
      ),
    ).rejects.toThrow(
      new ConflictException('La máquina ya está en ese estado.'),
    );
    expect(MACHINE_ALREADY_IN_STATUS_MESSAGE).toBe(
      'La máquina ya está en ese estado.',
    );
    expect(changes).toHaveLength(0);
  });

  it('AC5: solo el Administrador puede cambiar el estado o ver el historial', () => {
    expect(rolesAllowed(MachinesController, 'changeStatus')).toEqual(['ADMIN']);
    expect(rolesAllowed(MachinesController, 'history')).toEqual(['ADMIN']);
  });
});
