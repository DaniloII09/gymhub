import { ServiceUnavailableException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import type {
  CurrentMembership,
  MembershipStatusService,
} from '@Common/contracts';
import {
  MEMBERSHIP_STATUS_UNAVAILABLE_MESSAGE,
  MyMembershipService,
} from './my-membership.service.js';

const MEMBER_ID = 'member-1';

function serviceWith(current: CurrentMembership | null): {
  service: MyMembershipService;
  currentFor: ReturnType<typeof vi.fn>;
} {
  const currentFor = vi.fn().mockResolvedValue(current);
  const statusService: MembershipStatusService = { currentFor };
  const moduleRef = {
    get: vi.fn(() => {
      if (!current) throw new Error('Nest could not find the provider');
      return statusService;
    }),
  } as unknown as ModuleRef;
  return { service: new MyMembershipService(moduleRef), currentFor };
}

describe('MyMembershipService (H05)', () => {
  it('devuelve plan, estado, vencimiento y días restantes del miembro del token', async () => {
    const { service, currentFor } = serviceWith({
      status: 'ACTIVE',
      planName: 'Mensual',
      planType: 'MONTHLY',
      endDate: new Date('2026-12-15T06:00:00.000Z'),
      daysLeft: 27,
    });

    await expect(service.forMember(MEMBER_ID)).resolves.toEqual({
      status: 'ACTIVE',
      planName: 'Mensual',
      planType: 'MONTHLY',
      endDate: '2026-12-15',
      daysLeft: 27,
      includedClass: null,
    });
    expect(currentFor).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('usa la fecha de El Salvador para el vencimiento, no la de UTC', async () => {
    // 15/12 a las 11:30 p. m. en El Salvador = 16/12 05:30 UTC.
    const { service } = serviceWith({
      status: 'ACTIVE',
      planName: 'Trimestral',
      planType: 'QUARTERLY',
      endDate: new Date('2026-12-16T05:30:00.000Z'),
      daysLeft: 27,
    });

    const result = await service.forMember(MEMBER_ID);
    expect(result.endDate).toBe('2026-12-15');
  });

  it('miembro sin membresía: NONE con todo en null', async () => {
    const { service } = serviceWith({
      status: 'NONE',
      planName: null,
      planType: null,
      endDate: null,
      daysLeft: null,
    });

    await expect(service.forMember(MEMBER_ID)).resolves.toEqual({
      status: 'NONE',
      planName: null,
      planType: null,
      endDate: null,
      daysLeft: null,
      includedClass: null,
    });
  });

  it('pasa tal cual los estados vencida y pendiente de pago', async () => {
    for (const status of ['EXPIRED', 'PENDING_PAYMENT'] as const) {
      const { service } = serviceWith({
        status,
        planName: 'Mensual',
        planType: 'MONTHLY',
        endDate: new Date('2026-11-10T06:00:00.000Z'),
        daysLeft: 0,
      });
      const result = await service.forMember(MEMBER_ID);
      expect(result.status).toBe(status);
      expect(result.endDate).toBe('2026-11-10');
    }
  });

  it('clase suelta: incluye la clase que trae', async () => {
    const startsAt = new Date('2026-11-18T13:00:00.000Z');
    const { service } = serviceWith({
      status: 'ACTIVE',
      planName: 'Clase suelta',
      planType: 'DROP_IN',
      endDate: new Date('2026-11-18T06:00:00.000Z'),
      daysLeft: 0,
      includedClass: { name: 'Spinning Matutino', startsAt },
    });

    const result = await service.forMember(MEMBER_ID);
    expect(result.planType).toBe('DROP_IN');
    expect(result.daysLeft).toBe(0);
    expect(result.includedClass).toEqual({
      name: 'Spinning Matutino',
      startsAt,
    });
  });

  it('responde 503 con mensaje claro mientras H04 no registre el servicio de estado', async () => {
    const { service } = serviceWith(null);

    const call = service.forMember(MEMBER_ID);
    await expect(call).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(call).rejects.toThrow(MEMBERSHIP_STATUS_UNAVAILABLE_MESSAGE);
  });
});
