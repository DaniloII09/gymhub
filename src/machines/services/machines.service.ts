import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { paginate, toSkipTake, type Paginated } from '@Common/pagination';
import {
  MachineRepository,
  type MachineAvailability,
  type MachineStatusChangeWithAuthor,
} from '@Machines/repositories';
import {
  MachineAlreadyInStatusError,
  MachineNotFoundError,
  MachineStatusConflictError,
} from '@Machines/errors';
import type {
  ChangeMachineStatusDto,
  ListMachinesQueryDto,
  MachineAvailabilityQueryDto,
} from '@Machines/dto';
import type { Machine } from '@PrismaClient';

export const MACHINE_NOT_FOUND_MESSAGE = 'No encontramos esa máquina.';
export const MACHINE_ALREADY_IN_STATUS_MESSAGE =
  'La máquina ya está en ese estado.';
export const MACHINE_STATUS_CONFLICT_MESSAGE =
  'La máquina cambió de estado mientras guardabas. Vuelve a intentarlo.';

/**
 * Lógica de negocio del inventario de máquinas (H20) y de su consulta
 * pública (H21).
 *
 * No conoce Prisma: el acceso a datos pasa por MachineRepository, y los
 * errores de dominio se traducen acá a respuestas HTTP.
 */
@Injectable()
export class MachinesService {
  constructor(private readonly machineRepository: MachineRepository) {}

  async list(query: ListMachinesQueryDto): Promise<Paginated<Machine>> {
    const { machines, total } = await this.machineRepository.findPage({
      area: query.area,
      ...toSkipTake(query),
    });
    return paginate(machines, total, query);
  }

  /** Consulta pública: cualquier usuario con sesión ve el estado actual. */
  availability(
    query: MachineAvailabilityQueryDto,
  ): Promise<MachineAvailability[]> {
    return this.machineRepository.findAvailability({
      area: query.area,
      status: query.status,
    });
  }

  async changeStatus(
    machineId: number,
    { status, reason }: ChangeMachineStatusDto,
    changedById: string,
  ): Promise<MachineStatusChangeWithAuthor> {
    try {
      return await this.machineRepository.changeStatus({
        machineId,
        toStatus: status,
        reason,
        changedById,
      });
    } catch (error) {
      if (error instanceof MachineNotFoundError) {
        throw new NotFoundException(MACHINE_NOT_FOUND_MESSAGE);
      }
      if (error instanceof MachineAlreadyInStatusError) {
        throw new ConflictException(MACHINE_ALREADY_IN_STATUS_MESSAGE);
      }
      if (error instanceof MachineStatusConflictError) {
        throw new ConflictException(MACHINE_STATUS_CONFLICT_MESSAGE);
      }
      throw error;
    }
  }

  async history(machineId: number): Promise<MachineStatusChangeWithAuthor[]> {
    // Sin esta verificación, una máquina inexistente respondería una lista
    // vacía, igual que una máquina que nunca cambió de estado.
    if (!(await this.machineRepository.existsById(machineId))) {
      throw new NotFoundException(MACHINE_NOT_FOUND_MESSAGE);
    }
    return this.machineRepository.findHistory(machineId);
  }
}
