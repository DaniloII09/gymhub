import { plainToInstance } from 'class-transformer';
import { PendingChargesController } from '@Payments/controllers';
import { PendingChargesQueryDto } from '@Payments/dto';
import { ChargeRepository } from '@Payments/repositories';
import { ChargesService } from '@Payments/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

// 19 nov 2026 a mediodía en El Salvador.
const NOW = new Date('2026-11-19T18:00:00.000Z');

const row = (overrides: object = {}) => ({
  id: 4,
  memberCode: 'GYM-000003',
  fullName: 'Luis Martinez',
  concept: 'Membresía Trimestral',
  amount: { toString: () => '60.00', valueOf: () => 60 },
  dueDate: new Date('2026-11-13T00:00:00.000Z'),
  daysLate: 6,
  ...overrides,
});

/** Repositorio real con Prisma simulado: guarda la consulta SQL que arma. */
function fixture(rows: object[], totals = { count: rows.length, sum: 60 }) {
  const queries: { sql: string; values: unknown[] }[] = [];
  const prisma = {
    $queryRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      // Prisma.sql anidado (filtro por tipo) llega como objeto con su propio texto.
      const parts = values.map((v) =>
        v && typeof v === 'object' && 'strings' in v
          ? (v as { strings: string[] }).strings.join('?')
          : '?',
      );
      queries.push({
        sql: strings.reduce((acc, s, i) => acc + s + (parts[i] ?? ''), ''),
        values,
      });
      return Promise.resolve(rows);
    }),
    charge: {
      aggregate: vi.fn().mockResolvedValue({
        _count: { _all: totals.count },
        _sum: { amount: totals.count ? totals.sum : null },
      }),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const controller = new PendingChargesController(
    new ChargesService(new ChargeRepository(prisma as never)),
  );
  return {
    prisma,
    queries,
    controller,
    service: new ChargesService(new ChargeRepository(prisma as never)),
  };
}

describe('H17. Consultar los pagos pendientes', () => {
  it('AC1: muestra miembro, código, concepto, monto, vencimiento y atraso, 20 por página, con el total adeudado', async () => {
    const { controller, queries } = fixture([row()], { count: 1, sum: 60 });
    const query = plainToInstance(PendingChargesQueryDto, {});
    expect(query.pageSize).toBe(20);

    const result = await controller.listPending(query);

    expect(result).toEqual({
      data: [
        {
          chargeId: 4,
          memberCode: 'GYM-000003',
          fullName: 'Luis Martinez',
          concept: 'Membresía Trimestral',
          amount: 60,
          dueDate: '2026-11-13',
          daysLate: 6,
        },
      ],
      totalOwed: 60,
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(queries[0].sql).toContain('LIMIT ? OFFSET ?');
    expect(queries[0].values.slice(-2)).toEqual([20, 0]);
  });

  it('AC2: los días de atraso van del vencimiento a hoy, o 0 si todavía no vence', async () => {
    const { service, queries } = fixture([row()]);
    await service.listPending({ page: 1, pageSize: 20 }, NOW);

    expect(queries[0].sql).toContain(
      'GREATEST(?::date - c.due_date, 0)::int AS "daysLate"',
    );
    // "hoy" es la fecha del gimnasio.
    expect(queries[0].values[0]).toBe('2026-11-19');
  });

  it('AC3: ordena de más a menos días de atraso y, con los mismos días, por nombre', async () => {
    const { service, queries } = fixture([row()]);
    await service.listPending({ page: 1, pageSize: 20 }, NOW);

    expect(queries[0].sql).toMatch(
      /ORDER BY "daysLate" DESC, u\."fullName" ASC/,
    );
  });

  it('AC4: el filtro por tipo solo trae ese tipo y recalcula el total adeudado', async () => {
    const { service, queries, prisma } = fixture([row()], {
      count: 1,
      sum: 15.1 + 15.2,
    });
    const result = await service.listPending(
      { type: 'PERSONAL_SESSION', page: 1, pageSize: 20 },
      NOW,
    );

    expect(queries[0].sql).toContain('AND c.type = ?::"ChargeType"');
    expect(prisma.charge.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING', type: 'PERSONAL_SESSION' },
      }),
    );
    expect(result.totalOwed).toBe(30.3);
  });

  it('AC5: sin cobros pendientes responde una lista vacía y total 0 (la interfaz muestra "No hay pagos pendientes.")', async () => {
    const { controller } = fixture([], { count: 0, sum: 0 });
    const result = await controller.listPending(
      plainToInstance(PendingChargesQueryDto, {}),
    );

    expect(result).toMatchObject({ data: [], total: 0, totalOwed: 0 });
  });

  it('AC6: solo el Administrador puede abrir el listado', () => {
    expect(rolesAllowed(PendingChargesController, 'listPending')).toEqual([
      'ADMIN',
    ]);
  });
});
