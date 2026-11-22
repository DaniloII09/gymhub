import { MachinesController } from '@Machines/controllers';
import { MachineAvailabilityDto } from '@Machines/dto';
import { MachineRepository } from '@Machines/repositories';
import { MachinesService } from '@Machines/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

const ADMIN_ID = '99999999-9999-4999-8999-999999999999';

/** Inventario en memoria con lo que guarda la tabla, incluido lo interno. */
function fixture() {
  const machines = [
    {
      id: 3,
      name: 'Prensa de piernas',
      area: 'STRENGTH',
      status: 'OUT_OF_SERVICE',
      reason: 'Cable roto',
      changedById: ADMIN_ID,
    },
    { id: 1, name: 'Caminadora 2', area: 'CARDIO', status: 'OPERATIONAL' },
    {
      id: 2,
      name: 'Caminadora 1',
      area: 'CARDIO',
      status: 'UNDER_MAINTENANCE',
      reason: 'Banda',
      changedById: ADMIN_ID,
    },
    { id: 4, name: 'Mancuernas', area: 'FREE_WEIGHTS', status: 'OPERATIONAL' },
  ];
  const AREA_ORDER = ['CARDIO', 'STRENGTH', 'FREE_WEIGHTS'];
  const prisma = {
    machine: {
      findMany: vi.fn(async ({ where, orderBy, select }) => {
        expect(orderBy).toEqual([{ area: 'asc' }, { name: 'asc' }]);
        return machines
          .filter(
            (m) =>
              (!where.area || m.area === where.area) &&
              (!where.status || m.status === where.status),
          )
          .sort(
            (a, b) =>
              AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area) ||
              a.name.localeCompare(b.name),
          )
          .map((m) =>
            Object.fromEntries(
              Object.keys(select).map((k) => [k, m[k as keyof typeof m]]),
            ),
          );
      }),
    },
  };
  const service = new MachinesService(new MachineRepository(prisma as never));
  const controller = new MachinesController(service);
  return { machines, prisma, controller };
}

describe('H21. Saber si una máquina está fuera de servicio', () => {
  it('AC1: veo nombre, área y estado de cada máquina, ordenadas por área y nombre', async () => {
    const { controller } = fixture();
    const { data } = await controller.availability({});

    expect(data).toEqual([
      { name: 'Caminadora 1', area: 'CARDIO', status: 'UNDER_MAINTENANCE' },
      { name: 'Caminadora 2', area: 'CARDIO', status: 'OPERATIONAL' },
      { name: 'Prensa de piernas', area: 'STRENGTH', status: 'OUT_OF_SERVICE' },
      { name: 'Mancuernas', area: 'FREE_WEIGHTS', status: 'OPERATIONAL' },
    ]);
    // El color por estado lo pinta la interfaz (StatusBadge); se revisa en el caso manual.
  });

  it('AC2: el filtro por área o por estado solo trae las máquinas que cumplen', async () => {
    const { controller, prisma } = fixture();

    const cardio = await controller.availability({ area: 'CARDIO' });
    expect(cardio.data.map((m) => m.name)).toEqual([
      'Caminadora 1',
      'Caminadora 2',
    ]);

    const broken = await controller.availability({ status: 'OUT_OF_SERVICE' });
    expect(broken.data.map((m) => m.name)).toEqual(['Prensa de piernas']);

    const both = await controller.availability({
      area: 'CARDIO',
      status: 'OUT_OF_SERVICE',
    });
    expect(both.data).toEqual([]);
    expect(prisma.machine.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { area: 'CARDIO', status: 'OUT_OF_SERVICE' },
      }),
    );
  });

  it('AC3: después de un cambio de estado, la siguiente consulta trae el estado nuevo', async () => {
    const { controller, machines, prisma } = fixture();
    await controller.availability({});

    machines[1].status = 'OUT_OF_SERVICE';
    const { data } = await controller.availability({});

    // Sin caché: cada carga consulta la base.
    expect(prisma.machine.findMany).toHaveBeenCalledTimes(2);
    expect(data.find((m) => m.name === 'Caminadora 2')?.status).toBe(
      'OUT_OF_SERVICE',
    );
  });

  it('AC4: no se envía el motivo interno ni quién hizo el cambio', async () => {
    const { controller, prisma } = fixture();
    const { data } = await controller.availability({
      status: 'UNDER_MAINTENANCE',
    });

    expect(prisma.machine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { name: true, area: true, status: true },
      }),
    );
    expect(Object.keys(data[0]).sort()).toEqual(['area', 'name', 'status']);
    expect(
      MachineAvailabilityDto.fromEntity({
        name: 'X',
        area: 'CARDIO',
        status: 'OUT_OF_SERVICE',
        reason: 'interno',
      } as never),
    ).toEqual({ name: 'X', area: 'CARDIO', status: 'OUT_OF_SERVICE' });
  });

  it('AC5: el miembro puede consultar pero no cambiar el estado de una máquina', () => {
    expect(rolesAllowed(MachinesController, 'availability')).toEqual([
      'ADMIN',
      'RECEPTION',
      'TRAINER',
      'MEMBER',
    ]);
    expect(rolesAllowed(MachinesController, 'changeStatus')).toEqual(['ADMIN']);
  });
});
