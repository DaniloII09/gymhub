import type { ModuleRef } from '@nestjs/core';
import type {
  ExpiringMembership,
  MembershipExpirySource,
  NotificationService,
} from '@Common/contracts';
import { NotificationValidationError } from '@Notifications/errors';
import type { PrismaService } from '@Prisma/services';
import {
  EXPIRY_NOTICE_TITLE,
  ExpiryNoticesService,
  addDays,
  buildExpiryMessage,
  gymToday,
} from './expiry-notices.service.js';

const TODAY = '2026-11-18';

const monthly = (
  over: Partial<ExpiringMembership> = {},
): ExpiringMembership => ({
  membershipId: 1,
  memberId: 'member-1',
  planName: 'Mensual',
  planType: 'MONTHLY',
  endDate: new Date('2026-11-23T00:00:00.000Z'),
  renewed: false,
  ...over,
});

/** Base en memoria con la misma restricción única (membresía, tipo). */
function setup(
  byDate: Record<string, ExpiringMembership[]>,
  withSource = true,
) {
  const saved = new Set<string>();
  const tx = {
    expiryNotice: {
      createMany: vi.fn(
        ({ data }: { data: { membershipId: number; kind: string } }) => {
          const key = `${data.membershipId}:${data.kind}`;
          if (saved.has(key)) return Promise.resolve({ count: 0 });
          saved.add(key);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;
  const notify = vi.fn().mockResolvedValue(1);
  const notifications: NotificationService = { notify };
  const expiringOn = vi.fn((date: string) =>
    Promise.resolve(byDate[date] ?? []),
  );
  const source: MembershipExpirySource = { expiringOn };
  const moduleRef = {
    get: vi.fn(() => {
      if (!withSource) throw new Error('Nest could not find the provider');
      return source;
    }),
  } as unknown as ModuleRef;
  const service = new ExpiryNoticesService(prisma, moduleRef, notifications);
  return { service, notify, expiringOn, tx };
}

describe('ExpiryNoticesService (H26)', () => {
  it('fechas: hoy en El Salvador y suma de días sin moverse de zona', () => {
    // 19/11 03:00 UTC todavía es 18/11 a las 9 p. m. en El Salvador.
    expect(gymToday(new Date('2026-11-19T03:00:00.000Z'))).toBe('2026-11-18');
    expect(addDays('2026-11-28', 5)).toBe('2026-12-03');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('arma el mensaje de 5 días y el de mañana con la fecha dd/mm/aaaa', () => {
    expect(buildExpiryMessage('D5', 'Mensual', '2026-11-23')).toBe(
      'Tu membresía Mensual vence en 5 días, el 23/11/2026. Renuévala en recepción o desde Mis pagos.',
    );
    expect(buildExpiryMessage('D1', 'Trimestral', '2026-11-19')).toBe(
      'Tu membresía Trimestral vence mañana, el 19/11/2026. Renuévala en recepción o desde Mis pagos.',
    );
  });

  it('busca las que vencen en 5 días y mañana, y avisa con el servicio central', async () => {
    const { service, notify, expiringOn } = setup({
      '2026-11-23': [monthly()],
      '2026-11-19': [
        monthly({
          membershipId: 2,
          memberId: 'member-2',
          planName: 'Trimestral',
          planType: 'QUARTERLY',
        }),
      ],
    });

    const run = await service.runFor(TODAY);

    expect(expiringOn).toHaveBeenCalledWith('2026-11-23');
    expect(expiringOn).toHaveBeenCalledWith('2026-11-19');
    expect(run).toEqual({
      date: TODAY,
      sent: { D5: 1, D1: 1 },
      sourceAvailable: true,
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: ['member-1'],
        source: 'MEMBERSHIPS',
        title: EXPIRY_NOTICE_TITLE,
        referenceId: 'membership:1',
      }),
      expect.anything(),
    );
    expect(notify.mock.calls[1][0].message).toContain('vence mañana');
  });

  it('correr dos veces el mismo día no repite el aviso D5', async () => {
    const { service, notify } = setup({ '2026-11-23': [monthly()] });

    await service.runFor(TODAY);
    const second = await service.runFor(TODAY);

    expect(second.sent).toEqual({ D5: 0, D1: 0 });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('no avisa a quien ya renovó ni a la clase suelta', async () => {
    const { service, notify, tx } = setup({
      '2026-11-23': [
        monthly({ renewed: true }),
        monthly({
          membershipId: 3,
          memberId: 'member-3',
          planName: 'Clase suelta',
          planType: 'DROP_IN',
        }),
      ],
    });

    const run = await service.runFor(TODAY);

    expect(run.sent).toEqual({ D5: 0, D1: 0 });
    expect(notify).not.toHaveBeenCalled();
    expect(tx.expiryNotice.createMany).not.toHaveBeenCalled();
  });

  it('un miembro que el servicio central rechaza no detiene a los demás', async () => {
    const { service, notify } = setup({
      '2026-11-23': [
        monthly(),
        monthly({ membershipId: 2, memberId: 'member-2' }),
      ],
    });
    notify.mockRejectedValueOnce(
      new NotificationValidationError('Destinatario inactivo.'),
    );

    const run = await service.runFor(TODAY);

    expect(run.sent.D5).toBe(1);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('sin el contrato de Membresías (H04) no envía nada ni falla', async () => {
    const { service, notify } = setup({}, false);

    await expect(service.runFor(TODAY)).resolves.toEqual({
      date: TODAY,
      sent: { D5: 0, D1: 0 },
      sourceAvailable: false,
    });
    expect(notify).not.toHaveBeenCalled();
  });
});
