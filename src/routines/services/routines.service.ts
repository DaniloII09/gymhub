import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateRoutineDto, UpdateRoutineDto } from '@Routines/dto';
import {
  RoutineForbiddenError,
  RoutineMemberNotFoundError,
  RoutineNotFoundError,
} from '@Routines/errors';
import {
  RoutineRepository,
  type RoutineRecord,
} from '@Routines/repositories';

export const EMPTY_ROUTINE_UPDATE_MESSAGE =
  'Envía al menos un campo para actualizar.';
const MAX_INT_ID = 2_147_483_647;

/**
 * Rutinas de entrenamiento asignadas a miembros (H18 · BE-18.1).
 */
@Injectable()
export class RoutinesService {
  constructor(private readonly routineRepository: RoutineRepository) {}

  async create(
    trainerId: string,
    dto: CreateRoutineDto,
  ): Promise<RoutineRecord> {
    try {
      return await this.routineRepository.create({
        name: dto.name,
        trainerId,
        memberId: dto.memberId,
        daysOfWeek: dto.daysOfWeek,
        exercises: dto.exercises,
      });
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async update(
    routineId: number,
    trainerId: string,
    dto: UpdateRoutineDto,
  ): Promise<RoutineRecord> {
    if (!Number.isInteger(routineId) || routineId < 1 || routineId > MAX_INT_ID) {
      throw new NotFoundException(new RoutineNotFoundError().message);
    }
    if (
      dto.name === undefined &&
      dto.memberId === undefined &&
      dto.daysOfWeek === undefined &&
      dto.exercises === undefined
    ) {
      throw new BadRequestException(EMPTY_ROUTINE_UPDATE_MESSAGE);
    }

    try {
      return await this.routineRepository.update(routineId, trainerId, dto);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async remove(routineId: number, trainerId: string): Promise<void> {
    if (!Number.isInteger(routineId) || routineId < 1 || routineId > MAX_INT_ID) {
      throw new NotFoundException(new RoutineNotFoundError().message);
    }
    try {
      await this.routineRepository.remove(routineId, trainerId);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  listMine(memberId: string): Promise<RoutineRecord[]> {
    return this.routineRepository.findByMember(memberId);
  }

  listByTrainer(trainerId: string): Promise<RoutineRecord[]> {
    return this.routineRepository.findByTrainer(trainerId);
  }

  private mapDomainError(error: unknown): unknown {
    if (
      error instanceof RoutineNotFoundError ||
      error instanceof RoutineMemberNotFoundError
    ) {
      return new NotFoundException(error.message);
    }
    if (error instanceof RoutineForbiddenError) {
      return new ForbiddenException(error.message);
    }
    return error;
  }
}
