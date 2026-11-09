import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AvailabilityBlockRepository } from '../repositories/availability-block.repository.js';
import { CreateAvailabilityBlockDto } from '../dto/create-availability-block.dto.js';
import { AvailabilityBlockConflictError } from '../errors/availability-block-conflict.error.js';
import { AvailabilityBlockHasSessionsError } from '../errors/availability-block-has-sessions.error.js';

@Injectable()
export class AvailabilityBlocksService {
  constructor(
    private readonly repository: AvailabilityBlockRepository,
  ) {}

  async create(userId: string, dto: CreateAvailabilityBlockDto) {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime debe ser anterior a endTime');
    }

    const existingBlocks = await this.repository.findByTrainerAndWeekday(
      userId,
      dto.weekday,
    );

    // Validación de traslape / cruce de horario: (StartA < EndB) && (EndA > StartB)
    const hasOverlap = existingBlocks.some(
      (block) => dto.startTime < block.endTime && dto.endTime > block.startTime,
    );

    if (hasOverlap) {
      throw new ConflictException(
        new AvailabilityBlockConflictError().message,
      );
    }

    return this.repository.create(userId, dto);
  }

  async findAllByTrainer(userId: string) {
    return this.repository.findByTrainer(userId);
  }

  async remove(userId: string, blockId: string) {
    const block = await this.repository.findById(blockId);

    if (!block || block.userId !== userId) {
      throw new NotFoundException('Bloque de disponibilidad no encontrado');
    }

    const hasSessions = await this.repository.hasFutureScheduledSessions(blockId);

    if (hasSessions) {
      throw new ConflictException(
        new AvailabilityBlockHasSessionsError().message,
      );
    }

    return this.repository.delete(blockId);
  }
}
