/**
 * The threshold numbers are the whole of REQ-17's watchlist states 5 and 6 —
 * they are the spec, not an implementation detail — so they are asserted
 * against the requirement rather than against themselves.
 */
import { colors } from '../src/constants/colors';
import { STALE_DISCONNECTED_MS, STALE_WARNING_MS } from '../src/constants/thresholds';

describe('staleness thresholds', () => {
  it('warns at 60 seconds', () => {
    expect(STALE_WARNING_MS).toBe(60 * 1000);
  });

  it('reports disconnected at 5 minutes', () => {
    expect(STALE_DISCONNECTED_MS).toBe(5 * 60 * 1000);
  });

  it('orders the warning before the disconnected state', () => {
    expect(STALE_WARNING_MS).toBeLessThan(STALE_DISCONNECTED_MS);
  });
});

describe('colors', () => {
  it('exposes every token as a 6-digit hex value', () => {
    Object.entries(colors).forEach(([token, value]) => {
      expect(`${token}: ${value}`).toMatch(/: #[0-9A-F]{6}$/);
    });
  });

  it('keeps the two banner families distinct', () => {
    expect(colors.warningBackground).not.toBe(colors.dangerBackground);
    expect(colors.warningText).not.toBe(colors.dangerText);
  });
});
