import type { ModuleRef } from '@nestjs/core';
import { MEMBERSHIP_STATUS_SERVICE } from '@Common/contracts';
import { MembershipStatusLookup } from '@Payments/services';

const MEMBER_ID = '11111111-1111-1111-1111-111111111111';

describe('MembershipStatusLookup', () => {
  it('responde null mientras H04 no registre el contrato', async () => {
    const moduleRef = {
      get: vi.fn(() => {
        throw new Error('Nest could not find MembershipStatusService');
      }),
    };
    const lookup = new MembershipStatusLookup(
      moduleRef as unknown as ModuleRef,
    );

    await expect(lookup.statusFor(MEMBER_ID)).resolves.toBeNull();
  });

  it('con el contrato registrado devuelve el estado que calcula H04', async () => {
    const currentFor = vi.fn().mockResolvedValue({
      status: 'ACTIVE',
      planName: 'Mensual',
      planType: 'MONTHLY',
      endDate: new Date('2026-12-12'),
      daysLeft: 30,
    });
    const moduleRef = { get: vi.fn(() => ({ currentFor })) };
    const lookup = new MembershipStatusLookup(
      moduleRef as unknown as ModuleRef,
    );

    await expect(lookup.statusFor(MEMBER_ID)).resolves.toBe('ACTIVE');
    expect(moduleRef.get).toHaveBeenCalledWith(MEMBERSHIP_STATUS_SERVICE, {
      strict: false,
    });
    expect(currentFor).toHaveBeenCalledWith(MEMBER_ID);
  });
});
