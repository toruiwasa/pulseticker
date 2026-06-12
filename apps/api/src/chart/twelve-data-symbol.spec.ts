import { toTwelveDataSymbol } from './twelve-data-symbol';

describe('toTwelveDataSymbol', () => {
  it('passes US equity symbols through unchanged', () => {
    expect(toTwelveDataSymbol('AAPL')).toBe('AAPL');
    expect(toTwelveDataSymbol('MSFT')).toBe('MSFT');
    expect(toTwelveDataSymbol('VOO')).toBe('VOO');
  });

  it('strips the OANDA: prefix and rewrites the separator for forex pairs', () => {
    expect(toTwelveDataSymbol('OANDA:AUD_USD')).toBe('AUD/USD');
    expect(toTwelveDataSymbol('OANDA:EUR_JPY')).toBe('EUR/JPY');
  });
});
