import {
  dateFromGymDateAndMinutes,
  findMatchingAvailabilitySlot,
  generateCandidateSlotsForRange,
  gymDateString,
  gymIsoWeekday,
  gymTimeString,
  intervalsOverlap,
} from './trainer-calendar.js';

describe('trainer-calendar (America/El_Salvador UTC-06:00)', () => {
  it('convierte fechas y horas respetando el cambio de día en El Salvador', () => {
    // 23 nov 2026 05:30 UTC corresponde al domingo 22 nov 23:30 en El Salvador.
    const lateSunday = new Date('2026-11-23T05:30:00.000Z');
    expect(gymDateString(lateSunday)).toBe('2026-11-22');
    expect(gymTimeString(lateSunday)).toBe('23:30');
    expect(gymIsoWeekday(gymDateString(lateSunday))).toBe(7);

    // 23 nov 2026 06:00 UTC corresponde exactamente al lunes 23 nov 00:00 SV.
    const mondayMidnight = new Date('2026-11-23T06:00:00.000Z');
    expect(gymDateString(mondayMidnight)).toBe('2026-11-23');
    expect(gymTimeString(mondayMidnight)).toBe('00:00');
    expect(gymIsoWeekday(gymDateString(mondayMidnight))).toBe(1);
  });

  it('construye instantes UTC exactos desde fecha local SV y minutos', () => {
    const slot = dateFromGymDateAndMinutes('2026-11-23', 8 * 60);
    expect(slot.toISOString()).toBe('2026-11-23T14:00:00.000Z');
  });

  it('parte bloques en espacios exactos de 60 min y descarta fragmentos menores', () => {
    const blocks = [
      { id: 'b1', weekday: 1, startTime: '08:00', endTime: '10:30' },
      { id: 'b2', weekday: 1, startTime: '14:15', endTime: '15:00' },
    ];
    const from = new Date('2026-11-23T06:00:00.000Z'); // Lunes 00:00 SV
    const to = new Date('2026-11-24T06:00:00.000Z'); // Martes 00:00 SV
    const now = new Date('2026-11-22T12:00:00.000Z');

    const slots = generateCandidateSlotsForRange(blocks, from, to, now);

    expect(slots).toHaveLength(2);
    expect(slots.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
      '08:00-09:00',
      '09:00-10:00',
    ]);
    expect(slots[0].startsAt.toISOString()).toBe('2026-11-23T14:00:00.000Z');
    expect(slots[0].endsAt.toISOString()).toBe('2026-11-23T15:00:00.000Z');
  });

  it('maneja bloques contiguos sin perder espacios ni duplicar inicios', () => {
    const blocks = [
      { id: 'b1', weekday: 1, startTime: '08:00', endTime: '09:00' },
      { id: 'b2', weekday: 1, startTime: '09:00', endTime: '10:00' },
      { id: 'b3', weekday: 1, startTime: '09:00', endTime: '11:00' },
    ];
    const from = new Date('2026-11-23T06:00:00.000Z');
    const to = new Date('2026-11-24T06:00:00.000Z');
    const now = new Date('2026-11-22T12:00:00.000Z');

    const slots = generateCandidateSlotsForRange(blocks, from, to, now);
    expect(slots.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
      '08:00-09:00',
      '09:00-10:00',
      '10:00-11:00',
    ]);
  });

  it('respeta límite exacto del rango [from, to) y excluye espacios <= now', () => {
    const blocks = [
      { id: 'mon', weekday: 1, startTime: '08:00', endTime: '12:00' },
      { id: 'tue', weekday: 2, startTime: '00:00', endTime: '02:00' },
    ];
    // Rango termina exactamente el martes 24 a las 00:00 SV (06:00 UTC), por lo que martes no entra.
    const from = new Date('2026-11-23T06:00:00.000Z');
    const to = new Date('2026-11-24T06:00:00.000Z');
    // Si now = Lunes 09:00 SV, 08:00 y 09:00 quedan excluidos; empiezan desde 10:00 SV.
    const now = new Date('2026-11-23T15:00:00.000Z');

    const slots = generateCandidateSlotsForRange(blocks, from, to, now);
    expect(slots.map((s) => `${s.date} ${s.startTime}`)).toEqual([
      '2026-11-23 10:00',
      '2026-11-23 11:00',
    ]);
  });

  it('findMatchingAvailabilitySlot valida inicios exactos de 60 min y rechaza fragmentos', () => {
    const blocks = [
      { id: 'b1', weekday: 1, startTime: '08:00', endTime: '10:30' },
    ];

    const valid = findMatchingAvailabilitySlot(
      blocks,
      new Date('2026-11-23T15:00:00.000Z'), // 09:00 SV
    );
    expect(valid?.availabilityBlockId).toBe('b1');
    expect(valid?.startTime).toBe('09:00');
    expect(valid?.endTime).toBe('10:00');

    // 10:00-10:30 es fragmento < 60 min -> no válido
    expect(
      findMatchingAvailabilitySlot(
        blocks,
        new Date('2026-11-23T16:00:00.000Z'),
      ),
    ).toBeNull();

    // 08:30 no alinea con bloque -> no válido
    expect(
      findMatchingAvailabilitySlot(
        blocks,
        new Date('2026-11-23T14:30:00.000Z'),
      ),
    ).toBeNull();
  });

  it('intervalsOverlap trata correctamente límites contiguos vs solapamientos parciales', () => {
    const a1 = new Date('2026-11-23T14:00:00.000Z');
    const a2 = new Date('2026-11-23T15:00:00.000Z');
    const b1 = new Date('2026-11-23T15:00:00.000Z');
    const b2 = new Date('2026-11-23T16:00:00.000Z');
    const c1 = new Date('2026-11-23T14:30:00.000Z');
    const c2 = new Date('2026-11-23T15:20:00.000Z');

    expect(intervalsOverlap(a1, a2, b1, b2)).toBe(false);
    expect(intervalsOverlap(a1, a2, c1, c2)).toBe(true);
  });
});
