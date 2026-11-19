import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  ActiveDropInPlanExistsError,
  PlanNameTakenError,
  PlanNotFoundError,
} from '@Memberships/errors';
import { Prisma, type Plan, type PlanType } from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
/** Código de Prisma cuando el registro a actualizar no existe. */
const RECORD_NOT_FOUND = 'P2025';

// Índices únicos de la tabla plans (migración DB-3.1).
const NAME_INDEXES = ['plans_name_key', 'plans_name_lower_key'];
const SINGLE_ACTIVE_DROP_IN_INDEX = 'plans_single_active_drop_in_key';

export interface CreatePlanData {
  name: string;
  type: PlanType;
  durationDays: number | null;
  price: number;
  benefits: string | null;
}

export interface UpdatePlanData {
  name?: string;
  durationDays?: number;
  price?: number;
  benefits?: string | null;
}

/**
 * Único punto del módulo que habla con la tabla `plans`.
 *
 * Las reglas de unicidad las garantiza la base (nombre sin distinguir
 * mayúsculas y un solo DROP_IN activo), así que dos altas simultáneas no
 * pueden saltárselas. El P2002 se traduce aquí a errores de dominio según el
 * índice que falló, para que el servicio no conozca los códigos del ORM.
 */
@Injectable()
export class PlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number): Promise<Plan | null> {
    return this.prisma.plan.findUnique({ where: { id } });
  }

  /** El plan de clase suelta que se vende hoy (la base permite uno activo). */
  findActiveDropIn(): Promise<Plan | null> {
    return this.prisma.plan.findFirst({ where: { type: 'DROP_IN', isActive: true } });
  }

  /** Planes ordenados por nombre; con `activeOnly`, solo los que se venden. */
  findAll(activeOnly: boolean): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  /** ¿Hay otro plan con ese nombre, sin distinguir mayúsculas? */
  async nameExists(name: string, exceptId?: number): Promise<boolean> {
    const count = await this.prisma.plan.count({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
    });
    return count > 0;
  }

  async hasActiveDropIn(): Promise<boolean> {
    const count = await this.prisma.plan.count({ where: { type: 'DROP_IN', isActive: true } });
    return count > 0;
  }

  /**
   * @throws {PlanNameTakenError} si el nombre ya existe.
   * @throws {ActiveDropInPlanExistsError} si ya hay un DROP_IN activo.
   */
  async create(data: CreatePlanData): Promise<Plan> {
    try {
      return await this.prisma.plan.create({ data });
    } catch (error) {
      throw this.translate(error, data.name);
    }
  }

  /**
   * @throws {PlanNotFoundError} si el plan no existe.
   * @throws {PlanNameTakenError} si el nombre nuevo ya existe.
   */
  async update(id: number, data: UpdatePlanData): Promise<Plan> {
    try {
      return await this.prisma.plan.update({ where: { id }, data });
    } catch (error) {
      if (this.isPrismaError(error, RECORD_NOT_FOUND)) throw new PlanNotFoundError(id);
      throw this.translate(error, data.name ?? '');
    }
  }

  /**
   * Desactivar solo cambia isActive: las membresías vendidas con el plan no se
   * tocan. Desactivar uno ya inactivo no cambia nada.
   * @throws {PlanNotFoundError} si el plan no existe.
   */
  async deactivate(id: number): Promise<Plan> {
    try {
      return await this.prisma.plan.update({ where: { id }, data: { isActive: false } });
    } catch (error) {
      if (this.isPrismaError(error, RECORD_NOT_FOUND)) throw new PlanNotFoundError(id);
      throw error;
    }
  }

  private translate(error: unknown, name: string): unknown {
    if (!this.isPrismaError(error, UNIQUE_CONSTRAINT_VIOLATION)) return error;
    const index = this.violatedIndex(error);
    if (index === SINGLE_ACTIVE_DROP_IN_INDEX) return new ActiveDropInPlanExistsError();
    if (index && NAME_INDEXES.includes(index)) return new PlanNameTakenError(name);
    return error;
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  /**
   * Nombre del índice que falló. Con el adapter de pg, Prisma lo reporta en
   * `meta.driverAdapterError.cause.constraint.index`.
   */
  private violatedIndex(error: Prisma.PrismaClientKnownRequestError): string | null {
    const meta = error.meta as
      | { driverAdapterError?: { cause?: { constraint?: { index?: unknown } } } }
      | undefined;
    const index = meta?.driverAdapterError?.cause?.constraint?.index;
    return typeof index === 'string' ? index : null;
  }
}
