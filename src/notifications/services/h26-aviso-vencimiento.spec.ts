import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { MembershipRepository } from '@Memberships/repositories';
import { MembershipStatusService } from '@Memberships/services';
import {
  EXPIRY_NOTICE_TITLE,
  ExpiryNoticesJob,
  ExpiryNoticesService,
} from '@Notifications/services';
import {
  notificationFixture,
  uuid,
} from '../../../test/helpers/notification-fixture.js';

const JUAN = uuid(1);
const ANA = uuid(2);
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

interface FakeMembership {
  id: number;
  memberId: string;
  planType: 'MONTHLY' | 'QUARTERLY' | 'DROP_IN';
  planName: string;
  startDate: string;
  endDate: string;
  paid: boolean;
}

/**
 * Tarea real de H26 con la fuente real de Membresías (H04) y el servicio real
 * de avisos (H24) sobre tablas en memoria: memberships, expiry_notices y
 * notifications.
 */
function fixture(memberships: FakeMembership[]) {
  const n = notificationFixture();
  const expiryNotices: { membershipId: number; kind: string }[] = [];

  const membershipPrisma = {
    membership: {
      findMany: vi.fn(async ({ where }) =>
        memberships
          .filter(
            (m) =>
              day(m.endDate).getTime() === where.endDate.getTime() &&
              m.paid === (where.charge.status === 'PAID'),
          )
          .map((m) => ({
            id: m.id,
            memberId: m.memberId,
            planType: m.planType,
            plan: { name: m.planName },
            member: {
              memberships: memberships
                .filter(
                  (o) =>
                    o.memberId === m.memberId &&
                    day(o.startDate) > where.endDate,
                )
                .map((o) => ({ id: o.id })),
            },
          })),
      ),
    },
  };
  const source = new MembershipStatusService(
    new MembershipRepository(membershipPrisma as never),
  );

  const tx = {
    ...n.tx,
    expiryNotice: {
      createMany: vi.fn(async ({ data }) => {
        // Restricción única (membresía, tipo) con skipDuplicates.
        if (
          expiryNotices.some(
            (e) => e.membershipId === data.membershipId && e.kind === data.kind,
          )
        )
          return { count: 0 };
        expiryNotices.push({
          membershipId: data.membershipId,
          kind: data.kind,
        });
        return { count: 1 };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const moduleRef = { get: vi.fn(() => source) };
  const service = new ExpiryNoticesService(
    prisma as never,
    moduleRef as never,
    n.notifications,
  );
  const inboxOf = async (userId: string) =>
    (await n.inbox.list(userId, 1)).data;
  return { service, inboxOf, expiryNotices };
}

const monthly = (overrides: Partial<FakeMembership> = {}): FakeMembership => ({
  id: 10,
  memberId: JUAN,
  planType: 'MONTHLY',
  planName: 'Mensual',
  startDate: '2026-10-25',
  endDate: '2026-11-23',
  paid: true,
  ...overrides,
});

describe('H26. Recibir un aviso antes de que venza mi membresía', () => {
  // La tarea escribe un resumen en el log; aquí no hace falta verlo.
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  it('AC1: 5 días antes, a las 07:00, recibo "Tu membresía vence pronto" con la fecha de vencimiento', async () => {
    const cron = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      ExpiryNoticesJob.prototype.handle,
    );
    expect(cron).toMatchObject({
      cronTime: '0 7 * * *',
      timeZone: 'America/El_Salvador',
    });

    const { service, inboxOf } = fixture([
      monthly(),
      monthly({
        id: 11,
        memberId: ANA,
        planType: 'QUARTERLY',
        planName: 'Trimestral',
        startDate: '2026-08-25',
      }),
    ]);
    const run = await service.runFor('2026-11-18');

    expect(run.sent).toEqual({ D5: 2, D1: 0 });
    expect(await inboxOf(JUAN)).toEqual([
      expect.objectContaining({
        title: EXPIRY_NOTICE_TITLE,
        message:
          'Tu membresía Mensual vence en 5 días, el 23/11/2026. Renuévala en recepción o desde Mis pagos.',
        source: 'MEMBERSHIPS',
      }),
    ]);
    expect((await inboxOf(ANA))[0].message).toContain(
      'Trimestral vence en 5 días, el 23/11/2026',
    );
    expect(EXPIRY_NOTICE_TITLE).toBe('Tu membresía vence pronto');
  });

  it('AC2: el día antes del vencimiento recibo un segundo aviso con el mismo título', async () => {
    const { service, inboxOf } = fixture([monthly()]);
    await service.runFor('2026-11-18');
    const run = await service.runFor('2026-11-22');

    expect(run.sent).toEqual({ D5: 0, D1: 1 });
    const inbox = await inboxOf(JUAN);
    expect(inbox.map((x) => x.title)).toEqual([
      EXPIRY_NOTICE_TITLE,
      EXPIRY_NOTICE_TITLE,
    ]);
    expect(inbox[0].message).toContain('vence mañana, el 23/11/2026');
  });

  it('AC3: si ya renové, no recibo el aviso', async () => {
    const { service, inboxOf } = fixture([
      monthly(),
      monthly({ id: 12, startDate: '2026-11-24', endDate: '2026-12-23' }),
    ]);
    const run = await service.runFor('2026-11-18');

    expect(run.sent).toEqual({ D5: 0, D1: 0 });
    expect(await inboxOf(JUAN)).toEqual([]);
  });

  it('AC4: una clase suelta no genera aviso', async () => {
    const { service, inboxOf } = fixture([
      monthly({
        id: 13,
        planType: 'DROP_IN',
        planName: 'Clase suelta',
        startDate: '2026-11-23',
      }),
      monthly({
        id: 14,
        planType: 'DROP_IN',
        planName: 'Clase suelta',
        startDate: '2026-11-19',
        endDate: '2026-11-19',
      }),
    ]);
    await service.runFor('2026-11-18');
    await service.runFor('2026-11-22');

    expect(await inboxOf(JUAN)).toEqual([]);
  });

  it('AC5: si la tarea revisa de nuevo el mismo día, el aviso no llega repetido', async () => {
    const { service, inboxOf, expiryNotices } = fixture([monthly()]);

    const first = await service.runFor('2026-11-18');
    const second = await service.runFor('2026-11-18');

    expect(first.sent.D5).toBe(1);
    expect(second.sent.D5).toBe(0);
    expect(await inboxOf(JUAN)).toHaveLength(1);
    expect(expiryNotices).toEqual([{ membershipId: 10, kind: 'D5' }]);
  });
});
