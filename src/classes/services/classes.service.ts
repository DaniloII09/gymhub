import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLASS_CAPACITY_MAX,
  CLASS_CAPACITY_MIN,
  CLASS_CAPACITY_RANGE_MESSAGE,
  CLASS_DURATION_MAX_MINUTES,
  CLASS_DURATION_MIN_MINUTES,
  CLASS_DURATION_RANGE_MESSAGE,
  CLASS_NAME_LENGTH_MESSAGE,
  CLASS_NAME_MAX_LENGTH,
  CLASS_NAME_MIN_LENGTH,
  ENDS_BEFORE_STARTS_MESSAGE,
  MISSING_CLASS_NAME_MESSAGE,
  PAST_STARTS_AT_MESSAGE,
  type CreateClassDto,
  type UpdateClassDto,
} from '@Classes/dto';
import {
  CapacityBelowConfirmedReservationsError,
  ClassNotFoundError,
  ClassNotScheduledError,
  InvalidTrainerRoleError,
  TrainerNotFoundError,
  TrainerScheduleConflictError,
} from '@Classes/errors';
import {
  ClassRepository,
  type GymClassWithDetails,
} from '@Classes/repositories';

export const CLASS_NOT_FOUND_MESSAGE = 'No encontramos esa clase.';
export const CLASS_NOT_SCHEDULED_MESSAGE =
  'Solo se puede editar una clase programada.';
export const TRAINER_NOT_FOUND_MESSAGE =
  'No encontramos al entrenador seleccionado.';
export const INVALID_TRAINER_ROLE_MESSAGE =
  'El usuario seleccionado como entrenador debe tener el rol TRAINER.';

/**
 * Lógica de negocio para programar y editar clases grupales (H06 / BE-6.1).
 *
 * No conoce Prisma directamente: delega la persistencia y las transacciones a
 * `ClassRepository` y traduce los errores de dominio a excepciones HTTP.
 */
@Injectable()
export class ClassesService {
  constructor(private readonly classRepository: ClassRepository) {}

  async create(dto: CreateClassDto): Promise<GymClassWithDetails> {
    const name = this.validateName(dto.name);
    this.validateCapacity(dto.capacity);
    this.validateFutureStart(dto.startsAt);
    this.validateDuration(dto.startsAt, dto.endsAt);

    try {
      return await this.classRepository.create({
        name,
        trainerId: dto.trainerId,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        capacity: dto.capacity,
      });
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async update(
    classId: number,
    dto: UpdateClassDto,
  ): Promise<GymClassWithDetails> {
    const name =
      dto.name !== undefined ? this.validateName(dto.name) : undefined;

    if (dto.capacity !== undefined) {
      this.validateCapacity(dto.capacity);
    }

    if (dto.startsAt !== undefined) {
      this.validateFutureStart(dto.startsAt);
    }

    if (dto.startsAt !== undefined && dto.endsAt !== undefined) {
      this.validateDuration(dto.startsAt, dto.endsAt);
    } else if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      const existing = await this.classRepository.findById(classId);
      if (!existing) {
        throw new NotFoundException(CLASS_NOT_FOUND_MESSAGE);
      }
      const nextStartsAt = dto.startsAt ?? existing.startsAt;
      const nextEndsAt = dto.endsAt ?? existing.endsAt;
      this.validateFutureStart(nextStartsAt);
      this.validateDuration(nextStartsAt, nextEndsAt);
    }

    try {
      return await this.classRepository.update(classId, {
        ...(name !== undefined ? { name } : {}),
        ...(dto.trainerId !== undefined ? { trainerId: dto.trainerId } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      });
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  private validateName(rawName: string): string {
    const trimmed = typeof rawName === 'string' ? rawName.trim() : '';
    if (trimmed.length === 0) {
      throw new BadRequestException(MISSING_CLASS_NAME_MESSAGE);
    }
    if (
      trimmed.length < CLASS_NAME_MIN_LENGTH ||
      trimmed.length > CLASS_NAME_MAX_LENGTH
    ) {
      throw new BadRequestException(CLASS_NAME_LENGTH_MESSAGE);
    }
    return trimmed;
  }

  private validateCapacity(capacity: number): void {
    if (
      !Number.isInteger(capacity) ||
      capacity < CLASS_CAPACITY_MIN ||
      capacity > CLASS_CAPACITY_MAX
    ) {
      throw new BadRequestException(CLASS_CAPACITY_RANGE_MESSAGE);
    }
  }

  private validateFutureStart(startsAt: Date): void {
    if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException(
        'La fecha y hora de inicio no son válidas.',
      );
    }
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException(PAST_STARTS_AT_MESSAGE);
    }
  }

  private validateDuration(startsAt: Date, endsAt: Date): void {
    if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('La fecha y hora de fin no son válidas.');
    }
    const diffMs = endsAt.getTime() - startsAt.getTime();
    if (diffMs <= 0) {
      throw new BadRequestException(ENDS_BEFORE_STARTS_MESSAGE);
    }
    const durationMinutes = diffMs / 60_000;
    if (
      durationMinutes < CLASS_DURATION_MIN_MINUTES ||
      durationMinutes > CLASS_DURATION_MAX_MINUTES
    ) {
      throw new BadRequestException(CLASS_DURATION_RANGE_MESSAGE);
    }
  }

  private mapDomainError(error: unknown): unknown {
    if (error instanceof ClassNotFoundError) {
      return new NotFoundException(CLASS_NOT_FOUND_MESSAGE);
    }
    if (error instanceof ClassNotScheduledError) {
      return new ConflictException(CLASS_NOT_SCHEDULED_MESSAGE);
    }
    if (error instanceof TrainerNotFoundError) {
      return new NotFoundException(TRAINER_NOT_FOUND_MESSAGE);
    }
    if (error instanceof InvalidTrainerRoleError) {
      return new BadRequestException(INVALID_TRAINER_ROLE_MESSAGE);
    }
    if (error instanceof CapacityBelowConfirmedReservationsError) {
      return new ConflictException(error.message);
    }
    if (error instanceof TrainerScheduleConflictError) {
      return new ConflictException(error.message);
    }
    return error;
  }
}
