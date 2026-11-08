import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  MachineAlreadyInStatusError,
  MachineNotFoundError,
  MachineStatusConflictError,
} from '@Machines/errors';
import type {
  Machine,
  MachineArea,
  MachineStatus,
  MachineStatusChange,
} from '@PrismaClient';

export interface FindMachinesPageData {
  area?: MachineArea;
  skip: number;
  take: number;
}

export interface ChangeMachineStatusData {
  machineId: number;
  toStatus: MachineStatus;
  reason: string;
  changedById: string;
}

export interface FindAvailabilityData {
  area?: MachineArea;
  status?: MachineStatus;
}

/** Datos públicos de una máquina: sin id, motivo ni autor (H21). */
export type MachineAvailability = Pick<Machine, 'name' | 'area' | 'status'>;

/** Cambio de estado con el correo de quien lo hizo. */
export type MachineStatusChangeWithAuthor = MachineStatusChange & {
  changedBy: { email: string };
};

/** Solo se trae del autor lo que la respuesta muestra. */
const WITH_AUTHOR = { changedBy: { select: { email: true } } } as const;

/**
 * Único punto del módulo que habla con las tablas `machines` y
 * `machine_status_changes`.
 */
@Injectable()
export class MachineRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Página del inventario ordenada por área y nombre, con el total. */
  async findPage({
    area,
    skip,
    take,
  }: FindMachinesPageData): Promise<{ machines: Machine[]; total: number }> {
    const where = area ? { area } : {};
    const [machines, total] = await this.prisma.$transaction([
      this.prisma.machine.findMany({
        where,
        orderBy: [{ area: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.machine.count({ where }),
    ]);
    return { machines, total };
  }

  /**
   * Máquinas visibles para cualquier usuario, ordenadas por área y nombre.
   * Se lee de la base en cada llamada, sin caché, para que un cambio de estado
   * se vea en la siguiente consulta.
   */
  findAvailability({
    area,
    status,
  }: FindAvailabilityData): Promise<MachineAvailability[]> {
    return this.prisma.machine.findMany({
      where: { area, status },
      orderBy: [{ area: 'asc' }, { name: 'asc' }],
      select: { name: true, area: true, status: true },
    });
  }

  existsById(id: number): Promise<boolean> {
    return this.prisma.machine
      .count({ where: { id } })
      .then((count) => count > 0);
  }

  /**
   * Cambia el estado y agrega la fila del historial en una sola transacción,
   * para que el estado actual y el historial nunca se contradigan.
   *
   * La actualización solo aplica si la máquina sigue en el estado que se leyó
   * (control optimista): si dos administradores cambian la misma máquina a la
   * vez, el segundo recibe un conflicto en vez de dejar un `fromStatus` falso.
   * La fecha la pone la base de datos (`changedAt @default(now())`).
   *
   * @throws {MachineNotFoundError} si la máquina no existe.
   * @throws {MachineAlreadyInStatusError} si ya está en `toStatus`.
   * @throws {MachineStatusConflictError} si cambió durante la operación.
   */
  changeStatus({
    machineId,
    toStatus,
    reason,
    changedById,
  }: ChangeMachineStatusData): Promise<MachineStatusChangeWithAuthor> {
    return this.prisma.$transaction(async (tx) => {
      const machine = await tx.machine.findUnique({
        where: { id: machineId },
        select: { status: true },
      });
      if (!machine) throw new MachineNotFoundError(machineId);
      if (machine.status === toStatus) {
        throw new MachineAlreadyInStatusError(machineId, toStatus);
      }

      const { count } = await tx.machine.updateMany({
        where: { id: machineId, status: machine.status },
        data: { status: toStatus },
      });
      if (count === 0) throw new MachineStatusConflictError(machineId);

      return tx.machineStatusChange.create({
        data: {
          machineId,
          fromStatus: machine.status,
          toStatus,
          reason,
          changedById,
        },
        include: WITH_AUTHOR,
      });
    });
  }

  /** Historial completo de una máquina, del cambio más reciente al más antiguo. */
  findHistory(machineId: number): Promise<MachineStatusChangeWithAuthor[]> {
    return this.prisma.machineStatusChange.findMany({
      where: { machineId },
      // `id` desempata dos cambios registrados en el mismo milisegundo.
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      include: WITH_AUTHOR,
    });
  }
}
