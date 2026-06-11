import { describe, it, expect } from 'vitest';
import { isMarketOpen, US_MARKET_HOLIDAYS } from './holidays';

describe('isMarketOpen', () => {
  it('returns true during regular hours on a weekday', () => {
    // Tuesday 2026-06-09, 14:00 ET → 18:00 UTC
    expect(isMarketOpen(new Date('2026-06-09T18:00:00Z'))).toBe(true);
  });

  it('returns false on weekends', () => {
    // Saturday 2026-06-13
    expect(isMarketOpen(new Date('2026-06-13T18:00:00Z'))).toBe(false);
  });

  it('returns false on US market holidays', () => {
    // 2026-07-03 is observed Independence Day
    expect(isMarketOpen(new Date('2026-07-03T18:00:00Z'))).toBe(false);
  });

  it('returns false before 09:30 ET', () => {
    // 2026-06-09 09:00 ET → 13:00 UTC
    expect(isMarketOpen(new Date('2026-06-09T13:00:00Z'))).toBe(false);
  });

  it('returns false after 16:00 ET', () => {
    // 2026-06-09 16:30 ET → 20:30 UTC
    expect(isMarketOpen(new Date('2026-06-09T20:30:00Z'))).toBe(false);
  });

  it('holiday list contains expected entries', () => {
    expect(US_MARKET_HOLIDAYS).toContain('2026-12-25');
  });
});
