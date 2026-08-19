import { fetchTwelveDataQuote } from './twelve-data-quote.js';

describe('fetchTwelveDataQuote', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('parses close + previous_close into { c, pc, t } on a 200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        close: '0.6587',
        previous_close: '0.6531',
        timestamp: 1_700_000_000,
      }),
    });

    await expect(fetchTwelveDataQuote('AUD/USD', 'k')).resolves.toEqual({
      c: 0.6587,
      pc: 0.6531,
      t: 1_700_000_000,
    });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('symbol=AUD%2FUSD');
    expect(url).toContain('apikey=k');
  });

  it('throws on non-200 HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, json: jest.fn() });
    await expect(fetchTwelveDataQuote('AUD/USD', 'k')).rejects.toThrow(/429/);
  });

  it('throws when body status is "error"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ status: 'error', message: 'symbol not found' }),
    });
    await expect(fetchTwelveDataQuote('XYZ', 'k')).rejects.toThrow(/symbol not found/);
  });

  it('throws when close/previous_close are unparseable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ close: 'nope' }),
    });
    await expect(fetchTwelveDataQuote('XYZ', 'k')).rejects.toThrow(/unparseable/);
  });
});
