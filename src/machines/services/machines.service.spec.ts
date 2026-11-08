import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  MACHINE_ALREADY_IN_STATUS_MESSAGE,
  MACHINE_NOT_FOUND_MESSAGE,
  MACHINE_STATUS_CONFLICT_MESSAGE,
  MachinesService,
} from '@Machines/services';
import {
  MachineAlreadyInStatusError,
  MachineNotFoundError,
  MachineStatusConflictError,
} from '@Machines/errors';
import type {
  MachineRepository,
  MachineStatusChangeWithAuthor,
} from '@Machines/repositories';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

const change: MachineStatusChangeWithAuthor = {
  id: 1,
  machineId: 3,
  fromStatus: 'OPERATIONAL',
  toStatus: 'UNDER_MAINTENANCE',
  reason: 'Cambio de banda',
  changedById: ADMIN_ID,
  changedAt: new Date('2026-11-04T15:00:00Z'),
  changedBy: { email: 'admin@gymhub.test' },
};

describe('MachinesService', () => {
  let repository: {
    findPage: ReturnType<typeof vi.fn>;
    findAvailability: ReturnType<typeof vi.fn>;
    existsById: ReturnType<typeof vi.fn>;
    changeStatus: ReturnType<typeof vi.fn>;
    findHistory: ReturnType<typeof vi.fn>;
  };
  let service: MachinesService;

  beforeEach(() => {
    repository = {
      findPage: vi.fn(),
      findAvailability: vi.fn(),
      existsById: vi.fn(),
      changeStatus: vi.fn(),
      findHistory: vi.fn(),
    };
    service = new MachinesService(repository as unknown as MachineRepository);
  });

  describe('availability', () => {
    it('pasa los filtros de área y estado al repositorio', async () => {
      repository.findAvailability.mockResolvedValue([]);

      await service.availability({ area: 'CARDIO', status: 'OUT_OF_SERVICE' });

      expect(repository.findAvailability).toHaveBeenCalledWith({
        area: 'CARDIO',
        status: 'OUT_OF_SERVICE',
      });
    });

    it('sin filtros consulta todas las máquinas', async () => {
      repository.findAvailability.mockResolvedValue([]);

      await service.availability({});

      expect(repository.findAvailability).toHaveBeenCalledWith({
        area: undefined,
        status: undefined,
      });
    });

    it('devuelve las máquinas tal como las entrega el repositorio', async () => {
      const machines = [
        { name: 'Caminadora 1', area: 'CARDIO', status: 'OPERATIONAL' },
      ];
      repository.findAvailability.mockResolvedValue(machines);

      await expect(service.availability({})).resolves.toBe(machines);
    });
  });

  describe('list', () => {
    it('traduce page y pageSize a skip/take y arma la página', async () => {
      repository.findPage.mockResolvedValue({ machines: [], total: 25 });

      const page = await service.list({
        page: 2,
        pageSize: 20,
        area: 'CARDIO',
      });

      expect(repository.findPage).toHaveBeenCalledWith({
        area: 'CARDIO',
        skip: 20,
        take: 20,
      });
      expect(page).toEqual({ data: [], total: 25, page: 2, pageSize: 20 });
    });
  });

  describe('changeStatus', () => {
    const dto = {
      status: 'UNDER_MAINTENANCE',
      reason: 'Cambio de banda',
    } as const;

    it('registra el cambio con el usuario autenticado como autor', async () => {
      repository.changeStatus.mockResolvedValue(change);

      await expect(service.changeStatus(3, dto, ADMIN_ID)).resolves.toBe(
        change,
      );
      expect(repository.changeStatus).toHaveBeenCalledWith({
        machineId: 3,
        toStatus: 'UNDER_MAINTENANCE',
        reason: 'Cambio de banda',
        changedById: ADMIN_ID,
      });
    });

    it('responde 404 si la máquina no existe', async () => {
      repository.changeStatus.mockRejectedValue(new MachineNotFoundError(3));

      const result = service.changeStatus(3, dto, ADMIN_ID);
      await expect(result).rejects.toBeInstanceOf(NotFoundException);
      await expect(result).rejects.toThrow(MACHINE_NOT_FOUND_MESSAGE);
    });

    it('responde 409 si la máquina ya está en ese estado', async () => {
      repository.changeStatus.mockRejectedValue(
        new MachineAlreadyInStatusError(3, 'UNDER_MAINTENANCE'),
      );

      const result = service.changeStatus(3, dto, ADMIN_ID);
      await expect(result).rejects.toBeInstanceOf(ConflictException);
      await expect(result).rejects.toThrow(MACHINE_ALREADY_IN_STATUS_MESSAGE);
    });

    it('responde 409 si otro cambio ganó la carrera', async () => {
      repository.changeStatus.mockRejectedValue(
        new MachineStatusConflictError(3),
      );

      await expect(service.changeStatus(3, dto, ADMIN_ID)).rejects.toThrow(
        MACHINE_STATUS_CONFLICT_MESSAGE,
      );
    });

    it('deja pasar los errores que no son de dominio', async () => {
      const unexpected = new Error('se cayó la base');
      repository.changeStatus.mockRejectedValue(unexpected);

      await expect(service.changeStatus(3, dto, ADMIN_ID)).rejects.toBe(
        unexpected,
      );
    });
  });

  describe('history', () => {
    it('devuelve el historial de una máquina existente', async () => {
      repository.existsById.mockResolvedValue(true);
      repository.findHistory.mockResolvedValue([change]);

      await expect(service.history(3)).resolves.toEqual([change]);
    });

    it('responde 404 y no consulta el historial si la máquina no existe', async () => {
      repository.existsById.mockResolvedValue(false);

      await expect(service.history(99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.findHistory).not.toHaveBeenCalled();
    });
  });
});
