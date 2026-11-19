import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MEMBERSHIP_STATUS_SERVICE, type MembershipStatusService } from '@Common/contracts';
import { CheckInRepository } from '@CheckIns/repositories';
import { CheckInMemberNotFoundError, RecentCheckInError } from '@CheckIns/errors';
import type { CheckInLookupItemDto, CheckInResponseDto } from '@CheckIns/dto';
import { gymToday } from '@Memberships/services';
import { UserRepository } from '@Users/repositories';

export const CHECK_IN_MEMBER_NOT_FOUND_MESSAGE = 'No encontramos ese miembro.';
export const RECENT_CHECK_IN_MESSAGE = 'Este miembro ya registró su ingreso hace menos de 30 minutos.';
/** Máximo de resultados de la búsqueda (BE-13.1). */
export const LOOKUP_LIMIT = 10;

/**
 * Check-in en recepción (H13 · BE-13.1).
 *
 * El estado de la membresía sale siempre del contrato MEMBERSHIP_STATUS_SERVICE
 * (BE-4.3), así el check-in muestra lo mismo que el resto del sistema, y se
 * guarda con el ingreso como foto del momento.
 */
@Injectable()
export class CheckInsService {
  constructor(
    private readonly checkInRepository: CheckInRepository,
    private readonly userRepository: UserRepository,
    @Inject(MEMBERSHIP_STATUS_SERVICE) private readonly membershipStatus: MembershipStatusService,
  ) {}

  /**
   * Miembros activos por código exacto o parte del nombre (sin distinguir
   * mayúsculas), máximo 10, cada uno con su estado y su próxima fecha de pago.
   */
  async lookup(term: string): Promise<CheckInLookupItemDto[]> {
    const members = await this.userRepository.searchMembers(term, LOOKUP_LIMIT);
    return Promise.all(
      members.map(async (member) => {
        const current = await this.membershipStatus.currentFor(member.id);
        return {
          memberId: member.id,
          memberCode: member.memberCode ?? '',
          fullName: member.fullName,
          membershipStatus: current.status,
          // El vencimiento viaja como el último instante del día del gimnasio.
          nextPaymentDate: current.endDate ? gymToday(current.endDate) : null,
        };
      }),
    );
  }

  /**
   * Registra el ingreso con la hora del servidor y el usuario autenticado. No
   * deja registrar dos veces al mismo miembro en 30 minutos.
   */
  async register(memberId: string, registeredById: string, now: Date = new Date()): Promise<CheckInResponseDto> {
    const current = await this.membershipStatus.currentFor(memberId);
    try {
      const { checkIn, memberCode } = await this.checkInRepository.register({
        memberId,
        membershipStatus: current.status,
        registeredById,
        now,
      });
      return {
        checkInId: checkIn.id,
        memberCode,
        checkedInAt: checkIn.checkedInAt,
        membershipStatus: current.status,
        isException: checkIn.isException,
      };
    } catch (error) {
      if (error instanceof CheckInMemberNotFoundError) {
        throw new NotFoundException(CHECK_IN_MEMBER_NOT_FOUND_MESSAGE);
      }
      if (error instanceof RecentCheckInError) throw new ConflictException(RECENT_CHECK_IN_MESSAGE);
      throw error;
    }
  }
}
