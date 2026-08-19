import { describe, expect, it } from 'vitest';
import {
  canAdd,
  DEFAULT_SYMBOLS,
  MAX_WATCHLIST_SIZE,
  needsSeeding,
  normalizeSymbol,
} from './watchlist-rules.js';

describe('needsSeeding', () => {
  it('seeds a user with no profile row', () => {
    expect(needsSeeding({ hasProfile: false })).toBe(true);
  });

  it('does not re-seed a user who already has a profile row', () => {
    expect(needsSeeding({ hasProfile: true })).toBe(false);
  });

  it('keys on the profile row, not on watchlist contents — an emptied watchlist stays empty', () => {
    // The rule this pins: a user who deleted every symbol has a profile row and
    // must not be re-seeded. Nothing about watchlist size is an input here.
    expect(needsSeeding({ hasProfile: true })).toBe(false);
  });
});

describe('canAdd', () => {
  it('allows an add below the limit', () => {
    expect(canAdd({ count: MAX_WATCHLIST_SIZE - 1 })).toBe(true);
  });

  it('refuses an add at the limit', () => {
    expect(canAdd({ count: MAX_WATCHLIST_SIZE })).toBe(false);
  });

  it('refuses an add above the limit', () => {
    expect(canAdd({ count: MAX_WATCHLIST_SIZE + 1 })).toBe(false);
  });

  it('allows an add to an empty watchlist', () => {
    expect(canAdd({ count: 0 })).toBe(true);
  });
});

describe('normalizeSymbol', () => {
  it('uppercases', () => {
    expect(normalizeSymbol('aapl')).toBe('AAPL');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSymbol('  aapl  ')).toBe('AAPL');
  });

  it('leaves an already-normalized symbol unchanged', () => {
    expect(normalizeSymbol('OANDA:AUD_USD')).toBe('OANDA:AUD_USD');
  });

  it('preserves the OANDA prefix separator', () => {
    expect(normalizeSymbol('oanda:aud_usd')).toBe('OANDA:AUD_USD');
  });
});

describe('DEFAULT_SYMBOLS', () => {
  it('are already normalized, so seeding writes what create() would write', () => {
    for (const s of DEFAULT_SYMBOLS) {
      expect(normalizeSymbol(s)).toBe(s);
    }
  });

  it('fit within the watchlist limit', () => {
    expect(DEFAULT_SYMBOLS.length).toBeLessThanOrEqual(MAX_WATCHLIST_SIZE);
  });
});
