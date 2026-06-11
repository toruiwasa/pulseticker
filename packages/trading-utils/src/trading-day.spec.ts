import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { getLastTradingDayOpenUnix, isWeekendOrHoliday } from './trading-day';

const ET = 'America/New_York';

function etUnix(year: number, month: number, day: number, hour = 9, minute = 30): number {
  return DateTime.fromObject({ year, month, day, hour, minute }, { zone: ET }).toUnixInteger();
}

describe('isWeekendOrHoliday', () => {
  it('flags Saturday and Sunday', () => {
    expect(isWeekendOrHoliday(DateTime.fromObject({ year: 2026, month: 6, day: 13 }, { zone: ET }))).toBe(true);
    expect(isWeekendOrHoliday(DateTime.fromObject({ year: 2026, month: 6, day: 14 }, { zone: ET }))).toBe(true);
  });

  it('flags US market holidays', () => {
    expect(isWeekendOrHoliday(DateTime.fromObject({ year: 2026, month: 12, day: 25 }, { zone: ET }))).toBe(true);
  });

  it('does not flag regular weekdays', () => {
    expect(isWeekendOrHoliday(DateTime.fromObject({ year: 2026, month: 6, day: 9 }, { zone: ET }))).toBe(false);
  });
});

describe('getLastTradingDayOpenUnix', () => {
  it('returns today 09:30 ET on a regular trading day', () => {
    // Tuesday 2026-06-09, 14:00 ET → 18:00 UTC
    const now = new Date('2026-06-09T18:00:00Z');
    expect(getLastTradingDayOpenUnix(now)).toBe(etUnix(2026, 6, 9));
  });

  it('walks back from Saturday to Friday', () => {
    // Saturday 2026-06-13
    const now = new Date('2026-06-13T18:00:00Z');
    expect(getLastTradingDayOpenUnix(now)).toBe(etUnix(2026, 6, 12));
  });

  it('walks back from Sunday to Friday', () => {
    // Sunday 2026-06-14
    const now = new Date('2026-06-14T18:00:00Z');
    expect(getLastTradingDayOpenUnix(now)).toBe(etUnix(2026, 6, 12));
  });

  it('walks back past a holiday', () => {
    // 2026-12-25 (Christmas, Friday) → previous trading day is Thursday 12-24
    const now = new Date('2026-12-25T18:00:00Z');
    expect(getLastTradingDayOpenUnix(now)).toBe(etUnix(2026, 12, 24));
  });

  it('walks back past a holiday adjacent to a weekend', () => {
    // 2026-07-03 (observed Independence Day, Friday) → Thursday 07-02
    const now = new Date('2026-07-04T18:00:00Z'); // Sat after holiday Fri
    expect(getLastTradingDayOpenUnix(now)).toBe(etUnix(2026, 7, 2));
  });
});
