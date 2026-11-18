import { gymToday } from '@Payments/services';

describe('gymToday', () => {
  it('usa la fecha de El Salvador (UTC-6), no la de UTC', () => {
    // 12 nov 2026 a las 7 p. m. en El Salvador = 13 nov a la 1 a. m. en UTC.
    expect(gymToday(new Date('2026-11-13T01:00:00Z'))).toBe('2026-11-12');
    expect(gymToday(new Date('2026-11-13T06:00:00Z'))).toBe('2026-11-13');
  });
});
