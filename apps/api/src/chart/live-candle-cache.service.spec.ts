import { LiveCandleCacheService } from './live-candle-cache.service';
import { TwelveDataService } from './twelve-data.service';
import { FinnhubService } from '../finnhub/finnhub/finnhub.service';
import { CandlePoint } from './chart.types';

function makeCandles(values: number[]): CandlePoint[] {
  return values.map((v, i) => ({ time: 1_700_000_000 + i * 60, value: v }));
}

describe('LiveCandleCacheService', () => {
  let twelve: jest.Mocked<TwelveDataService>;
  let finnhub: jest.Mocked<FinnhubService>;
  let service: LiveCandleCacheService;

  beforeEach(() => {
    twelve = { getTimeSeries: jest.fn() } as unknown as jest.Mocked<TwelveDataService>;
    finnhub = {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    } as unknown as jest.Mocked<FinnhubService>;
    service = new LiveCandleCacheService(twelve, finnhub);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-12T00:00:00Z'));
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('getCandles()', () => {
    it('fetches from Twelve Data on miss and subscribes to Finnhub', async () => {
      const candles = makeCandles([100, 101, 102]);
      twelve.getTimeSeries.mockResolvedValue(candles);

      const result = await service.getCandles('AAPL', '1D');

      expect(result).toEqual(candles);
      expect(twelve.getTimeSeries).toHaveBeenCalledWith('AAPL', '1D');
      expect(finnhub.subscribe).toHaveBeenCalledWith('AAPL');
    });

    it('returns cached entry on hit without re-fetching', async () => {
      twelve.getTimeSeries.mockResolvedValue(makeCandles([100]));
      await service.getCandles('AAPL', '1D');
      twelve.getTimeSeries.mockClear();
      finnhub.subscribe.mockClear();

      const result = await service.getCandles('AAPL', '1D');

      expect(result).toEqual(makeCandles([100]));
      expect(twelve.getTimeSeries).not.toHaveBeenCalled();
      expect(finnhub.subscribe).not.toHaveBeenCalled();
    });

    it('keys cache by (symbol, range) — same symbol different range hits Twelve Data again', async () => {
      twelve.getTimeSeries.mockResolvedValue(makeCandles([100]));
      await service.getCandles('AAPL', '1D');
      await service.getCandles('AAPL', '1Y');

      expect(twelve.getTimeSeries).toHaveBeenCalledTimes(2);
      expect(twelve.getTimeSeries).toHaveBeenNthCalledWith(1, 'AAPL', '1D');
      expect(twelve.getTimeSeries).toHaveBeenNthCalledWith(2, 'AAPL', '1Y');
      expect(finnhub.subscribe).toHaveBeenCalledTimes(2);
    });

    it('de-dupes concurrent cache misses for the same (symbol, range)', async () => {
      let resolveTwelveData: (c: CandlePoint[]) => void = () => {};
      twelve.getTimeSeries.mockReturnValue(
        new Promise<CandlePoint[]>(resolve => { resolveTwelveData = resolve; }),
      );

      const p1 = service.getCandles('AAPL', '1D');
      const p2 = service.getCandles('AAPL', '1D');

      resolveTwelveData(makeCandles([100, 101]));

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual(r2);
      expect(twelve.getTimeSeries).toHaveBeenCalledTimes(1);
      expect(finnhub.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('applyTick()', () => {
    it('updates the rightmost candle value in place for every cached range of the symbol', async () => {
      twelve.getTimeSeries.mockResolvedValueOnce(makeCandles([100, 101]));
      twelve.getTimeSeries.mockResolvedValueOnce(makeCandles([90, 95]));

      const oneDay = await service.getCandles('AAPL', '1D');
      const oneYear = await service.getCandles('AAPL', '1Y');

      service.applyTick('AAPL', 200, 9_999_999);

      expect(oneDay[oneDay.length - 1].value).toBe(200);
      expect(oneYear[oneYear.length - 1].value).toBe(200);
      // bucket time unchanged
      expect(oneDay[oneDay.length - 1].time).toBe(makeCandles([100, 101])[1].time);
    });

    it('does not touch other symbols', async () => {
      twelve.getTimeSeries.mockResolvedValueOnce(makeCandles([100, 101]));
      const aapl = await service.getCandles('AAPL', '1D');

      service.applyTick('MSFT', 999, 0);
      expect(aapl[1].value).toBe(101);
    });

    it('is a no-op when no cache entry exists for the symbol', () => {
      expect(() => service.applyTick('GOOG', 100, 0)).not.toThrow();
    });
  });

  describe('eviction', () => {
    it('drops entries whose lastAccessed is older than 15 minutes and unsubscribes once per evicted range', async () => {
      twelve.getTimeSeries.mockResolvedValueOnce(makeCandles([1]));
      twelve.getTimeSeries.mockResolvedValueOnce(makeCandles([2]));

      await service.getCandles('AAPL', '1D');
      await service.getCandles('AAPL', '1Y');
      service.onModuleInit();

      // Advance past TTL
      jest.advanceTimersByTime(15 * 60 * 1000 + 1000);
      // Trigger one sweep
      jest.advanceTimersByTime(60 * 1000);

      expect(finnhub.unsubscribe).toHaveBeenCalledTimes(2);
      expect(finnhub.unsubscribe).toHaveBeenCalledWith('AAPL');

      // After eviction, next request should miss again
      twelve.getTimeSeries.mockClear();
      twelve.getTimeSeries.mockResolvedValue(makeCandles([3]));
      await service.getCandles('AAPL', '1D');
      expect(twelve.getTimeSeries).toHaveBeenCalledTimes(1);
    });

    it('does not evict entries accessed within the TTL window', async () => {
      twelve.getTimeSeries.mockResolvedValue(makeCandles([1]));
      await service.getCandles('AAPL', '1D');
      service.onModuleInit();

      jest.advanceTimersByTime(10 * 60 * 1000); // 10 min
      jest.advanceTimersByTime(60 * 1000);      // sweep tick

      expect(finnhub.unsubscribe).not.toHaveBeenCalled();
    });
  });
});
