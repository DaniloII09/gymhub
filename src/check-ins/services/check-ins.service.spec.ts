import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  CHECK_IN_MEMBER_NOT_FOUND_MESSAGE,
  CheckInsService,
  LOOKUP_LIMIT,
  RECENT_CHECK_IN_MESSAGE,
} from '@CheckIns/services';
import { CheckInMemberNotFoundError, RecentCheckInError } from '@CheckIns/errors';
import type { CheckInRepository } from '@CheckIns/repositories';
import type { UserRepository } from '@Users/repositories';
import type { CurrentMembership, MembershipStatusService } from '@Common/contracts';
import { endOfGymDay } from '@Memberships/services';

const NOW = new Date('2026-11-19T18:00:00.000Z');
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

const active: CurrentMembership = {
  status: 'ACTIVE',
  planName: 'Mensual',
  planType: 'MONTHLY',
  endDate: endOfGymDay('2026-12-08'),
  daysLeft: 19,
};
const none: CurrentMembership = {
  status: 'NONE',
  planName: null,
  planType: null,
  endDate: null,
  daysLeft: null,
};

function build() {
  const checkInRepository = {
    register: vi.fn().mockImplementation(async (data) => ({
      checkIn: { id: 21, checkedInAt: data.now, isException: false },
      memberCode: 'GYM-000001',
    })),
  };
  const userRepository = {
    searchMembers: vi.fn().mockResolvedValue([
      { id: MEMBER_ID, memberCode: 'GYM-000001', fullName: 'Juan Perez' },
      { id: 'other', memberCode: 'GYM-000009', fullName: 'Juana Nueva' },
    ]),
  };
  const membershipStatus = {
    currentFor: vi.fn().mockImplementation(async (id: string) => (id === MEMBER_ID ? active : none)),
  };
  const service = new CheckInsService(
    checkInRepository as unknown as CheckInRepository,
    userRepository as unknown as UserRepository,
    membershipStatus as unknown as MembershipStatusService,
  );
  return { service, checkInRepository, userRepository, membershipStatus };
}

describe('CheckInsService.lookup (BE-13.1)', () => {
  it('busca máximo 10 y trae el estado y la próxima fecha de pago de cada miembro', async () => {
    const { service, userRepository } = build();

    const result = await service.lookup('juan');

    expect(userRepository.searchMembers).toHaveBeenCalledWith('juan', LOOKUP_LIMIT);
    expect(LOOKUP_LIMIT).toBe(10);
    expect(result).toEqual([
      {
        memberId: MEMBER_ID,
        memberCode: 'GYM-000001',
        fullName: 'Juan Perez',
        membershipStatus: 'ACTIVE',
        nextPaymentDate: '2026-12-08',
      },
      {
        memberId: 'other',
        memberCode: 'GYM-000009',
        fullName: 'Juana Nueva',
        membershipStatus: 'NONE',
        nextPaymentDate: null,
      },
    ]);
  });

  it('sin coincidencias devuelve una lista vacía', async () => {
    const { service, userRepository } = build();
    userRepository.searchMembers.mockResolvedValue([]);
    await expect(service.lookup('nadie')).resolves.toEqual([]);
  });
});

describe('CheckInsService.register (BE-13.1)', () => {
  it('guarda la hora del servidor, quien registra y la foto del estado', async () => {
    const { service, checkInRepository } = build();

    const result = await service.register(MEMBER_ID, 'recep', NOW);

    expect(checkInRepository.register).toHaveBeenCalledWith({
      memberId: MEMBER_ID,
      membershipStatus: 'ACTIVE',
      registeredById: 'recep',
      now: NOW,
    });
    expect(result).toEqual({
      checkInId: 21,
      memberCode: 'GYM-000001',
      checkedInAt: NOW,
      membershipStatus: 'ACTIVE',
      isException: false,
    });
  });

  it('un ingreso hace menos de 30 minutos responde 409 con el mensaje de la historia', async () => {
    const { service, checkInRepository } = build();
    checkInRepository.register.mockRejectedValue(new RecentCheckInError(MEMBER_ID));
    await expect(service.register(MEMBER_ID, 'recep', NOW)).rejects.toThrow(
      new ConflictException(RECENT_CHECK_IN_MESSAGE),
    );
  });

  it('un miembro inexistente responde 404', async () => {
    const { service, checkInRepository } = build();
    checkInRepository.register.mockRejectedValue(new CheckInMemberNotFoundError(MEMBER_ID));
    await expect(service.register(MEMBER_ID, 'recep', NOW)).rejects.toThrow(
      new NotFoundException(CHECK_IN_MEMBER_NOT_FOUND_MESSAGE),
    );
  });
});
