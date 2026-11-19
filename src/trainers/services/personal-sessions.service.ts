import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CreatePersonalSessionDto,
  ListTrainerSlotsQueryDto,
} from '@Trainers/dto';
import {
  InvalidTrainerRoleError,
  SessionPricingUnavailableError,
  SessionSlotAlreadyTakenError,
  TrainerNotFoundError,
} from '@Trainers/errors';
import {
  PersonalSessionRepository,
  type PersonalSessionWithDetails,
  type TrainerSessionWithDetails,
  type TrainerSummary,
} from '@Trainers/repositories';
import type { PersonalSessionOutcome, PersonalSessionStatus } from '@PrismaClient';
import { AvailabilityBlocksService } from './availability-blocks.service.js';
import { SessionPricingService } from './session-pricing.service.js';
import {
  findMatchingAvailabilitySlot,
  generateCandidateSlotsForRange,
  gymDateString,
  gymTimeString,
  intervalsOverlap,
  type CandidateSlot,
} from './trainer-calendar.js';

export const MAX_TRAINER_SLOTS_DAYS = 14;
export const SLOTS_RANGE_EXCEEDED_MESSAGE =
  'El rango de consulta de disponibilidad no puede superar los 14 días.';
export const MIN_BOOKING_ADVANCE_HOURS = 12;
export const MIN_BOOKING_ADVANCE_MESSAGE =
  'Las sesiones se agendan con al menos 12 horas de anticipación.';
export const SLOT_NOT_IN_AVAILABILITY_MESSAGE =
  'El horario seleccionado no corresponde a un espacio libre de 60 minutos del entrenador.';
export const SLOT_ALREADY_TAKEN_MESSAGE = 'Ese horario ya fue tomado.';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Lógica de negocio para entrenadores activos, generación de espacios libres de
 * 60 minutos (BE-11.1) y agendamiento transaccional con cobro PENDING (BE-11.2).
 */
@Injectable()
export class PersonalSessionsService {
  constructor(
    private readonly repository: PersonalSessionRepository,
    private readonly availabilityBlocksService: AvailabilityBlocksService,
    private readonly pricingService: SessionPricingService,
  ) {}

  listActiveTrainers(): Promise<TrainerSummary[]> {
    return this.repository.findActiveTrainers();
  }

  async listAvailableSlots(
    trainerId: string,
    query?: ListTrainerSlotsQueryDto,
    now: Date = new Date(),
  ): Promise<{
    trainer: TrainerSummary;
    from: Date;
    to: Date;
    slots: CandidateSlot[];
  }> {
    const days = query?.days ?? MAX_TRAINER_SLOTS_DAYS;
    if (days > MAX_TRAINER_SLOTS_DAYS) {
      throw new BadRequestException(SLOTS_RANGE_EXCEEDED_MESSAGE);
    }

    const from = query?.from ?? now;
    const to = query?.to ?? new Date(from.getTime() + days * MS_PER_DAY);

    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException(
        'La fecha final del filtro (to) debe ser posterior a la fecha inicial (from).',
      );
    }

    if (to.getTime() - from.getTime() > MAX_TRAINER_SLOTS_DAYS * MS_PER_DAY) {
      throw new BadRequestException(SLOTS_RANGE_EXCEEDED_MESSAGE);
    }

    const trainer = await this.requireActiveTrainer(trainerId);
    const blocks =
      await this.availabilityBlocksService.findAllByTrainer(trainerId);

    const candidates = generateCandidateSlotsForRange(blocks, from, to, now);
    if (candidates.length === 0) {
      return { trainer, from, to, slots: [] };
    }

    const { sessions, classes } =
      await this.repository.findScheduledConflictsForTrainer(
        trainerId,
        from,
        to,
      );

    const slots = candidates.filter((slot) => {
      const overlapsSession = sessions.some((s) =>
        intervalsOverlap(slot.startsAt, slot.endsAt, s.startsAt, s.endsAt),
      );
      if (overlapsSession) return false;

      const overlapsClass = classes.some((c) =>
        intervalsOverlap(slot.startsAt, slot.endsAt, c.startsAt, c.endsAt),
      );
      return !overlapsClass;
    });

    return { trainer, from, to, slots };
  }

  async book(
    memberId: string,
    dto: CreatePersonalSessionDto,
    now: Date = new Date(),
  ): Promise<PersonalSessionWithDetails> {
    if (!(dto.startsAt instanceof Date) || Number.isNaN(dto.startsAt.getTime())) {
      throw new BadRequestException('La fecha y hora de inicio no son válidas.');
    }

    if (
      dto.startsAt.getTime() - now.getTime() <
      MIN_BOOKING_ADVANCE_HOURS * MS_PER_HOUR
    ) {
      throw new BadRequestException(MIN_BOOKING_ADVANCE_MESSAGE);
    }

    const trainer = await this.requireActiveTrainer(dto.trainerId);
    const blocks = await this.availabilityBlocksService.findAllByTrainer(
      dto.trainerId,
    );

    const matchingSlot = findMatchingAvailabilitySlot(blocks, dto.startsAt);
    if (!matchingSlot) {
      throw new BadRequestException(SLOT_NOT_IN_AVAILABILITY_MESSAGE);
    }

    let price: number;
    try {
      price = await this.pricingService.requireConfiguredPrice();
    } catch (error) {
      if (error instanceof SessionPricingUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }

    const dateStr = gymDateString(matchingSlot.startsAt);
    const timeStr = gymTimeString(matchingSlot.startsAt);
    const concept = `Sesión personal (${dateStr} ${timeStr}) - ${trainer.fullName}`.slice(
      0,
      80,
    );
    const dueDate = new Date(`${dateStr}T00:00:00Z`);

    try {
      return await this.repository.book({
        trainerId: dto.trainerId,
        memberId,
        availabilityBlockId: matchingSlot.availabilityBlockId,
        startsAt: matchingSlot.startsAt,
        endsAt: matchingSlot.endsAt,
        price,
        concept,
        dueDate,
      });
    } catch (error) {
      if (error instanceof TrainerNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof InvalidTrainerRoleError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof SessionSlotAlreadyTakenError) {
        throw new ConflictException(SLOT_ALREADY_TAKEN_MESSAGE);
      }
      throw error;
    }
  }

  listMine(
    memberId: string,
    status?: PersonalSessionStatus,
  ): Promise<PersonalSessionWithDetails[]> {
    return this.repository.findByMember(memberId, status);
  }

  listTrainerAgenda(
    trainerId: string,
    now: Date = new Date(),
  ): Promise<TrainerSessionWithDetails[]> {
    return this.repository.findUpcomingForTrainer(
      trainerId,
      new Date(now.getTime() - MS_PER_DAY),
      new Date(now.getTime() + 14 * MS_PER_DAY),
    );
  }

  async markTrainerResult(
    sessionId: number,
    trainerId: string,
    outcome: PersonalSessionOutcome,
    now: Date = new Date(),
  ): Promise<TrainerSessionWithDetails> {
    if (!Number.isInteger(sessionId) || sessionId < 1 || sessionId > 2_147_483_647) {
      throw new NotFoundException('La sesión no existe.');
    }
    const result = await this.repository.markTrainerResult(sessionId, trainerId, outcome, now);
    if (result === 'NOT_FOUND') throw new NotFoundException('La sesión no existe.');
    if (result === 'INVALID_WINDOW') {
      throw new ConflictException('Solo puedes marcar el resultado desde el inicio de la sesión y hasta 24 horas después.');
    }
    return result;
  }

  private async requireActiveTrainer(
    trainerId: string,
  ): Promise<TrainerSummary> {
    const user = await this.repository.findTrainerById(trainerId);
    if (!user) {
      throw new NotFoundException(new TrainerNotFoundError(trainerId).message);
    }
    if (user.role !== 'TRAINER' || !user.isActive) {
      throw new BadRequestException(
        new InvalidTrainerRoleError(trainerId).message,
      );
    }
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
    };
  }
}
