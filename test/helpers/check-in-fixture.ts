import { CheckInRepository } from '../../src/check-ins/repositories/check-in.repository.js';
import { CheckInsService } from '../../src/check-ins/services/check-ins.service.js';
import type {
  CurrentMembership,
  MembershipStatusService,
} from '../../src/common/contracts/index.js';
import type { UserRepository } from '../../src/users/repositories/index.js';

export const MEMBER_ID = '22222222-2222-4222-8222-222222222222';

/**
 * CheckInsService con el repositorio real y una transacción simulada. Guarda
 * lo que se crea y permite indicar ingresos recientes y el estado de la membresía.
 */
export function checkInFixture(
  options: {
    membership?: Partial<CurrentMembership>;
    recentCheckIns?: number;
    members?: { id: string; memberCode: string; fullName: string }[];
  } = {},
) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue([{ id: MEMBER_ID, memberCode: 'GYM-000001' }]),
    checkIn: {
      count: vi.fn().mockResolvedValue(options.recentCheckIns ?? 0),
      create: vi.fn(async ({ data }) => ({ id: 1, ...data })),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const membership: CurrentMembership = {
    status: 'ACTIVE',
    planName: 'Mensual',
    planType: 'MONTHLY',
    endDate: new Date('2026-12-08T12:00:00Z'),
    daysLeft: 17,
    ...options.membership,
  } as CurrentMembership;
  const statusService = {
    currentFor: vi.fn().mockResolvedValue(membership),
  } as unknown as MembershipStatusService;
  const userRepository = {
    searchMembers: vi.fn().mockResolvedValue(options.members ?? []),
  };
  const service = new CheckInsService(
    new CheckInRepository(prisma as never),
    userRepository as unknown as UserRepository,
    statusService,
  );
  return { service, tx, userRepository };
}
