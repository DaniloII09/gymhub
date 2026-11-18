import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AlreadyReservedError,
  ClassAlreadyStartedError,
  ClassFullError,
  ClassNotFoundError,
  ClassNotScheduledError,
  DropInMembershipNotAllowedError,
  MembershipInactiveError,
  MembershipUnavailableError,
} from '@Classes/errors';
import {
  ClassReservationRepository,
  type ClassReservationWithClass,
} from '@Classes/repositories';
import type { ReservationStatus } from '@PrismaClient';
import { CLASS_NOT_FOUND_MESSAGE } from './classes.service.js';
import { MembershipEligibilityService } from './membership-eligibility.service.js';

export const CLASS_FULL_CODE = 'CLASS_FULL';
export const CLASS_FULL_MESSAGE = 'La clase está llena.';
export const ALREADY_RESERVED_MESSAGE = 'Ya tienes una reserva en esta clase.';
export const RESERVATION_NOT_SCHEDULED_MESSAGE =
  'Solo puedes reservar en una clase programada.';

const MAX_CLASS_ID = 2_147_483_647;

/**
 * Lógica de negocio de reservas de clases grupales (H07 / BE-7.2).
 */
@Injectable()
export class ClassReservationsService {
  constructor(
    private readonly reservationRepository: ClassReservationRepository,
    private readonly membershipEligibility: MembershipEligibilityService,
  ) {}

  async reserve(
    classId: number,
    memberId: string,
  ): Promise<ClassReservationWithClass> {
    if (classId < 1 || classId > MAX_CLASS_ID) {
      throw new NotFoundException(CLASS_NOT_FOUND_MESSAGE);
    }

    try {
      await this.membershipEligibility.assertCanReserve(memberId);
      return await this.reservationRepository.reserve(classId, memberId);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  listMine(
    memberId: string,
    status?: ReservationStatus,
  ): Promise<ClassReservationWithClass[]> {
    return this.reservationRepository.findByMember(memberId, status);
  }

  private mapDomainError(error: unknown): unknown {
    if (error instanceof MembershipUnavailableError) {
      return new ServiceUnavailableException(error.message);
    }
    if (error instanceof MembershipInactiveError) {
      return new ForbiddenException(error.message);
    }
    if (error instanceof DropInMembershipNotAllowedError) {
      return new ForbiddenException(error.message);
    }
    if (error instanceof ClassNotFoundError) {
      return new NotFoundException(CLASS_NOT_FOUND_MESSAGE);
    }
    if (error instanceof ClassNotScheduledError) {
      return new ConflictException(RESERVATION_NOT_SCHEDULED_MESSAGE);
    }
    if (error instanceof ClassAlreadyStartedError) {
      return new ConflictException(error.message);
    }
    if (error instanceof AlreadyReservedError) {
      return new ConflictException(ALREADY_RESERVED_MESSAGE);
    }
    if (error instanceof ClassFullError) {
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: CLASS_FULL_CODE,
        message: CLASS_FULL_MESSAGE,
      });
    }
    return error;
  }
}
