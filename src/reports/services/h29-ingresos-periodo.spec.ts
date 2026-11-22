import { BadRequestException } from '@nestjs/common';
import { IncomeReportController } from '@Reports/controllers';
import { IncomeRepository } from '@Reports/repositories';
import { IncomeReportService } from '@Reports/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';
import { captureQueryRaw } from '../../../test/helpers/sql-capture.js';

const dec = (n: number) => ({ toString: () => String(n), valueOf: () => n });

function fixture(rows: object[]) {
  const raw = captureQueryRaw([rows]);
  const service = new IncomeReportService(
    new IncomeRepository({ $queryRaw: raw.fn } as never),
  );
  return { queries: raw.queries, service };
}

describe('H29. Ver los ingresos de un periodo', () => {
  it('AC1: total desglosado por membresías, clases sueltas y sesiones personales, y por mes', async () => {
    const { service } = fixture([
      { month: '2026-10', type: 'MEMBERSHIP', amount: dec(50), receipts: 2 },
      { month: '2026-10', type: 'DROP_IN', amount: dec(5), receipts: 1 },
      { month: '2026-11', type: 'MEMBERSHIP', amount: dec(60), receipts: 1 },
      {
        month: '2026-11',
        type: 'PERSONAL_SESSION',
        amount: dec(30.3),
        receipts: 2,
      },
    ]);
    const report = await service.getIncome('2026-09-15', '2026-11-30');

    expect(report.totals).toEqual({
      membership: 110,
      dropIn: 5,
      personalSession: 30.3,
      total: 145.3,
      receiptCount: 6,
    });
    expect(report.months).toEqual([
      {
        month: '2026-09',
        membership: 0,
        dropIn: 0,
        personalSession: 0,
        total: 0,
        receiptCount: 0,
      },
      {
        month: '2026-10',
        membership: 50,
        dropIn: 5,
        personalSession: 0,
        total: 55,
        receiptCount: 3,
      },
      {
        month: '2026-11',
        membership: 60,
        dropIn: 0,
        personalSession: 30.3,
        total: 90.3,
        receiptCount: 3,
      },
    ]);
    expect(report.message).toBeNull();

    await expect(service.getIncome('2026-01-01', '2027-01-01')).rejects.toThrow(
      new BadRequestException('El rango no puede ser mayor a 12 meses.'),
    );
  });

  it('AC2: el total coincide con los comprobantes del rango porque filtra por la fecha de emisión', async () => {
    const { service, queries } = fixture([
      { month: '2026-11', type: 'MEMBERSHIP', amount: dec(25), receipts: 1 },
    ]);
    const report = await service.getIncome('2026-11-01', '2026-11-30');

    const { sql, values } = queries[0];
    expect(sql).toContain(
      'FROM receipts r JOIN charges c ON c.id = r.charge_id',
    );
    expect(sql).toContain(
      "WHERE timezone(?, r.issued_at AT TIME ZONE 'UTC')::date BETWEEN ?::date AND ?::date",
    );
    expect(sql).not.toContain('due_date');
    expect(values.slice(-3)).toEqual([
      'America/El_Salvador',
      '2026-11-01',
      '2026-11-30',
    ]);
    expect(report.totals).toMatchObject({ total: 25, receiptCount: 1 });
  });

  it('AC3: sin pagos en el rango responde "No hay pagos en ese rango." y total 0', async () => {
    const { service } = fixture([]);
    const report = await service.getIncome('2026-11-01', '2026-11-30');

    expect(report.message).toBe('No hay pagos en ese rango.');
    expect(report.totals.total).toBe(0);
    // La interfaz lo muestra como $0.00 (caso manual).
    expect(report.totals.total.toFixed(2)).toBe('0.00');
  });

  it('AC4: Recepción, Entrenador y Miembro no pueden abrir el reporte', () => {
    expect(rolesAllowed(IncomeReportController, 'getIncome')).toEqual([
      'ADMIN',
    ]);
  });
});
