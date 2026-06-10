import { describe, expect, it } from 'vitest';
import { OandaPipe } from './oanda.pipe';

describe('OandaPipe', () => {
  const pipe = new OandaPipe();

  it('transforms OANDA:AUD_USD to AUD/USD', () => {
    expect(pipe.transform('OANDA:AUD_USD')).toBe('AUD/USD');
  });

  it('transforms OANDA:AUD_JPY to AUD/JPY', () => {
    expect(pipe.transform('OANDA:AUD_JPY')).toBe('AUD/JPY');
  });

  it('passes through plain tickers unchanged', () => {
    expect(pipe.transform('AAPL')).toBe('AAPL');
    expect(pipe.transform('VOO')).toBe('VOO');
  });

  it('handles null and undefined safely', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });

  it('handles empty string safely', () => {
    expect(pipe.transform('')).toBe('');
  });
});
