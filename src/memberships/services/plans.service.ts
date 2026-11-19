import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanRepository, type UpdatePlanData } from '@Memberships/repositories';
import {
  ActiveDropInPlanExistsError,
  PlanNameTakenError,
  PlanNotFoundError,
} from '@Memberships/errors';
import { DROP_IN_DURATION_MESSAGE, type CreatePlanDto, type UpdatePlanDto } from '@Memberships/dto';
import type { Plan } from '@PrismaClient';

export const PLAN_NOT_FOUND_MESSAGE = 'No encontramos ese plan.';
export const PLAN_NAME_TAKEN_MESSAGE = 'Ya existe un plan con ese nombre.';
export const ACTIVE_DROP_IN_EXISTS_MESSAGE = 'Ya existe un plan de clase suelta activo.';

/**
 * Planes del gimnasio (H03 / BE-3.1).
 *
 * Revisa las reglas antes de escribir para responder con el motivo exacto, y
 * aun así traduce los errores del repositorio: si dos altas llegan a la vez,
 * la que pierde la carrera choca con el índice único de la base.
 */
@Injectable()
export class PlansService {
  constructor(private readonly planRepository: PlanRepository) {}

  list(activeOnly: boolean): Promise<Plan[]> {
    return this.planRepository.findAll(activeOnly);
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    if (await this.planRepository.nameExists(dto.name)) {
      throw new ConflictException(PLAN_NAME_TAKEN_MESSAGE);
    }
    if (dto.type === 'DROP_IN' && (await this.planRepository.hasActiveDropIn())) {
      throw new ConflictException(ACTIVE_DROP_IN_EXISTS_MESSAGE);
    }

    try {
      return await this.planRepository.create({
        name: dto.name,
        type: dto.type,
        durationDays: dto.type === 'DROP_IN' ? null : (dto.durationDays ?? null),
        price: dto.price,
        benefits: emptyToNull(dto.benefits),
      });
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  /** Edita nombre, duración, precio o beneficios. El tipo no cambia. */
  async update(planId: number, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.planRepository.findById(planId);
    if (!plan) throw new NotFoundException(PLAN_NOT_FOUND_MESSAGE);

    if (plan.type === 'DROP_IN' && dto.durationDays !== undefined) {
      throw new BadRequestException(DROP_IN_DURATION_MESSAGE);
    }
    if (dto.name !== undefined && (await this.planRepository.nameExists(dto.name, planId))) {
      throw new ConflictException(PLAN_NAME_TAKEN_MESSAGE);
    }

    const data: UpdatePlanData = {
      name: dto.name,
      durationDays: dto.durationDays,
      price: dto.price,
      ...(dto.benefits !== undefined ? { benefits: emptyToNull(dto.benefits) } : {}),
    };

    try {
      return await this.planRepository.update(planId, data);
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  /** Deja de ofrecerse en la venta; las membresías ya vendidas no cambian. */
  async deactivate(planId: number): Promise<Plan> {
    try {
      return await this.planRepository.deactivate(planId);
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  private toHttp(error: unknown): unknown {
    if (error instanceof PlanNotFoundError) return new NotFoundException(PLAN_NOT_FOUND_MESSAGE);
    if (error instanceof PlanNameTakenError) return new ConflictException(PLAN_NAME_TAKEN_MESSAGE);
    if (error instanceof ActiveDropInPlanExistsError) {
      return new ConflictException(ACTIVE_DROP_IN_EXISTS_MESSAGE);
    }
    return error;
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  return value ? value : null;
}
