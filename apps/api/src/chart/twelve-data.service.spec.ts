import { ConfigService } from '@nestjs/config';
import { TwelveDataService } from './twelve-data.service.js';
import { DateTime } from 'luxon';

describe('TwelveDataService', () => {
  let service: TwelveDataService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    const config = { getOrThrow: jest.fn().mockReturnValue('test-key') } as unknown as ConfigService;
    service = new TwelveDataService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('getTimeSeries — 1D', () => {
    it('parses Twelve Data 1-min response into sorted CandlePoint[] with ET timestamps', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 'ok',
          values: [
            { datetime: '2026-06-10 09:31:00', close: '186.00' },
            { datetime: '2026-06-10 09:30:00', close: '185.50' },
          ],
        }),
      }) as unknown as typeof fetch;

      const result = await service.getTimeSeries('AAPL', '1D');
      const open = DateTime.fromObject({ year: 2026, month: 6, day: 10, hour: 9, minute: 30 }, { zone: 'America/New_York' }).toUnixInteger();

      expect(result).toEqual([
        { time: open, value: 185.5 },
        { time: open + 60, value: 186 },
      ]);

      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('symbol=AAPL');
      expect(url).toContain('interval=1min');
      expect(url).toContain('outputsize=390');
      expect(url).toContain('timezone=America%2FNew_York');
      expect(url).toContain('apikey=test-key');
    });

    it('translates OANDA forex symbols to Twelve Data form', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'ok', values: [] }),
      }) as unknown as typeof fetch;

      await service.getTimeSeries('OANDA:AUD_USD', '1D');

      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('symbol=AUD%2FUSD');
    });
  });

  describe('getTimeSeries — 1Y', () => {
    it('uses interval=1day and outputsize=253', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 'ok',
          values: [{ datetime: '2026-06-09', close: '184.00' }],
        }),
      }) as unknown as typeof fetch;

      await service.getTimeSeries('AAPL', '1Y');

      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('interval=1day');
      expect(url).toContain('outputsize=253');
    });
  });

  describe('error handling', () => {
    it('returns [] on non-200 HTTP response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: jest.fn(),
      }) as unknown as typeof fetch;

      await expect(service.getTimeSeries('AAPL', '1D')).resolves.toEqual([]);
    });

    it('returns [] when Twelve Data body status is "error"', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'error', message: 'symbol not found' }),
      }) as unknown as typeof fetch;

      await expect(service.getTimeSeries('XYZ', '1D')).resolves.toEqual([]);
    });

    it('returns [] when fetch throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
      await expect(service.getTimeSeries('AAPL', '1D')).resolves.toEqual([]);
    });
  });
});
