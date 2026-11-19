import {
  addDays,
  computeCurrentMembership,
  daysBetween,
  endOfGymDay,
  gymToday,
  type MembershipSnapshot,
} from '@Memberships/services';

const TODAY = '2026-11-19';

const monthly = (overrides: Partial<MembershipSnapshot> = {}): MembershipSnapshot => ({
  planName: 'Mensual',
  planType: 'MONTHLY',
  startDate: '2026-11-10',
  endDate: '2026-12-09',
  paid: true,
  ...overrides,
});

describe('fechas del gimnasio', () => {
  it('hoy es la fecha de El Salvador, no la de UTC', () => {
    // 19 nov 03:00 UTC = 18 nov 21:00 en El Salvador.
    expect(gymToday(new Date('2026-11-19T03:00:00.000Z'))).toBe('2026-11-18');
  });

  it('un plan de 30 días desde el 2026-11-10 vence el 2026-12-09', () => {
    expect(addDays('2026-11-10', 30 - 1)).toBe('2026-12-09');
  });

  it('suma y resta días cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-19', '2026-12-09')).toBe(20);
    expect(daysBetween('2026-11-19', '2026-11-18')).toBe(-1);
  });

  it('el vencimiento viaja como el último instante del día en El Salvador', () => {
    const end = endOfGymDay('2026-12-09');
    expect(end.toISOString()).toBe('2026-12-10T05:59:59.999Z');
    expect(gymToday(end)).toBe('2026-12-09');
  });
});

describe('computeCurrentMembership (BE-4.3)', () => {
  it('sin membresías devuelve NONE', () => {
    expect(computeCurrentMembership([], TODAY)).toEqual({
      status: 'NONE',
      planName: null,
      planType: null,
      endDate: null,
      daysLeft: null,
    });
  });

  it('pagada y vigente es ACTIVE con sus días restantes', () => {
    expect(computeCurrentMembership([monthly()], TODAY)).toMatchObject({
      status: 'ACTIVE',
      planName: 'Mensual',
      planType: 'MONTHLY',
      endDate: endOfGymDay('2026-12-09'),
      daysLeft: 20,
    });
  });

  it('vence hoy: sigue ACTIVE con 0 días', () => {
    expect(computeCurrentMembership([monthly({ endDate: TODAY })], TODAY)).toMatchObject({
      status: 'ACTIVE',
      daysLeft: 0,
    });
  });

  it('con endDate de ayer es EXPIRED aunque la tarea diaria no haya corrido', () => {
    expect(computeCurrentMembership([monthly({ endDate: '2026-11-18' })], TODAY)).toMatchObject({
      status: 'EXPIRED',
      daysLeft: null,
      endDate: endOfGymDay('2026-11-18'),
    });
  });

  it('con el cobro pendiente es PENDING_PAYMENT', () => {
    expect(computeCurrentMembership([monthly({ paid: false })], TODAY)).toMatchObject({
      status: 'PENDING_PAYMENT',
      daysLeft: 20,
    });
  });

  it('una renovación sin pagar no oculta la membresía activa', () => {
    const current = monthly();
    const renewal = monthly({ startDate: '2026-12-10', endDate: '2027-01-08', paid: false });
    expect(computeCurrentMembership([renewal, current], TODAY)).toMatchObject({
      status: 'ACTIVE',
      endDate: endOfGymDay('2026-12-09'),
    });
  });

  it('con la renovación ya pagada muestra la que está corriendo', () => {
    const current = monthly();
    const renewal = monthly({
      planName: 'Trimestral',
      planType: 'QUARTERLY',
      startDate: '2026-12-10',
      endDate: '2027-03-09',
    });
    expect(computeCurrentMembership([renewal, current], TODAY)).toMatchObject({
      status: 'ACTIVE',
      planName: 'Mensual',
    });
  });

  it('vencida y luego una nueva sin pagar: PENDING_PAYMENT de la nueva', () => {
    const old = monthly({ startDate: '2026-10-01', endDate: '2026-10-30' });
    const fresh = monthly({ startDate: TODAY, endDate: '2026-12-18', paid: false });
    expect(computeCurrentMembership([old, fresh], TODAY)).toMatchObject({
      status: 'PENDING_PAYMENT',
      endDate: endOfGymDay('2026-12-18'),
    });
  });

  it('una sin pagar cuyo periodo ya pasó cuenta como EXPIRED', () => {
    expect(
      computeCurrentMembership([monthly({ paid: false, endDate: '2026-11-01' })], TODAY),
    ).toMatchObject({ status: 'EXPIRED' });
  });

  it('varias vencidas: muestra la de vencimiento más reciente', () => {
    const older = monthly({ planName: 'Viejo', endDate: '2026-09-30' });
    const newer = monthly({ planName: 'Reciente', endDate: '2026-10-30' });
    expect(computeCurrentMembership([older, newer], TODAY)).toMatchObject({
      status: 'EXPIRED',
      planName: 'Reciente',
    });
  });

  it('la clase suelta de hoy pagada es ACTIVE y vence hoy', () => {
    const dropIn = monthly({
      planName: 'Clase suelta',
      planType: 'DROP_IN',
      startDate: TODAY,
      endDate: TODAY,
    });
    expect(computeCurrentMembership([dropIn], TODAY)).toMatchObject({
      status: 'ACTIVE',
      planType: 'DROP_IN',
      daysLeft: 0,
    });
  });
});
