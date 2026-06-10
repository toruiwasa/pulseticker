import { describe, expect, it } from 'vitest';
import { US_MARKET_HOLIDAYS, isMarketOpen } from './market-holidays';

// Helper: build a Date in EST/EDT for a given local NY clock time.
// We construct UTC dates such that, after timezone conversion to America/New_York,
// the wall-clock matches the values we pass in.
// Simpler: build the Date in UTC at a known offset from NY time.
// EST = UTC-5, EDT = UTC-4. For dates we use, we'll pick months that don't
// straddle DST changes and compute the right UTC time.
function nyDate(y: number, m: number, d: number, h: number, min: number, offsetHours: number): Date {
  // m is 1-12. offsetHours is the offset to add to NY time to get UTC.
  return new Date(Date.UTC(y, m - 1, d, h + offsetHours, min));
}

describe('US_MARKET_HOLIDAYS', () => {
  it('includes 2026-2030 New Year holidays', () => {
    expect(US_MARKET_HOLIDAYS).toContain('2026-01-01');
    expect(US_MARKET_HOLIDAYS).toContain('2029-01-01');
    expect(US_MARKET_HOLIDAYS).toContain('2030-01-01');
  });

  it('includes 2026-2030 Christmas holidays (observed)', () => {
    expect(US_MARKET_HOLIDAYS).toContain('2026-12-25');
    expect(US_MARKET_HOLIDAYS).toContain('2027-12-24'); // observed (Dec 25 is Sat)
    expect(US_MARKET_HOLIDAYS).toContain('2028-12-25');
  });
});

describe('isMarketOpen', () => {
  it('returns true on a weekday during market hours', () => {
    // Tuesday 2026-03-03 at 10:00 EST (EST = UTC-5)
    expect(isMarketOpen(nyDate(2026, 3, 3, 10, 0, 5))).toBe(true);
  });

  it('returns false on a Saturday', () => {
    // Saturday 2026-03-07 at 10:00 EST
    expect(isMarketOpen(nyDate(2026, 3, 7, 10, 0, 5))).toBe(false);
  });

  it('returns false on a Sunday', () => {
    // Sunday 2026-03-08 at 10:00 EST (note: DST starts this day at 2am, but at 10am it's EDT)
    expect(isMarketOpen(nyDate(2026, 3, 8, 10, 0, 4))).toBe(false);
  });

  it('returns false before 09:30 ET on a weekday', () => {
    // Tuesday 2026-03-03 at 09:29 EST
    expect(isMarketOpen(nyDate(2026, 3, 3, 9, 29, 5))).toBe(false);
  });

  it('returns true exactly at 09:30 ET on a weekday', () => {
    expect(isMarketOpen(nyDate(2026, 3, 3, 9, 30, 5))).toBe(true);
  });

  it('returns false at 16:00 ET on a weekday', () => {
    // Tuesday 2026-03-03 at 16:00 EST
    expect(isMarketOpen(nyDate(2026, 3, 3, 16, 0, 5))).toBe(false);
  });

  it('returns false on a hardcoded holiday (2026-01-01)', () => {
    // 2026-01-01 is a Thursday, 10:00 EST — but it's New Year's Day
    expect(isMarketOpen(nyDate(2026, 1, 1, 10, 0, 5))).toBe(false);
  });

  it('returns false on Thanksgiving 2026 (2026-11-26)', () => {
    // Thursday 2026-11-26 at 10:00 EST
    expect(isMarketOpen(nyDate(2026, 11, 26, 10, 0, 5))).toBe(false);
  });
});
