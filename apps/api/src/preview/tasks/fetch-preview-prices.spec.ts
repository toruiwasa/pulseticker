import { ConfigService } from '@nestjs/config';
import { JobHelpers } from 'graphile-worker';
import { fetchFinnhubQuote } from '../../common/utils/finnhub-quote';
import { fetchTwelveDataQuote } from '../../common/utils/twelve-data-quote';
import { PreviewCacheService } from '../preview-cache.service';
import { makeFetchPreviewPricesTask, __resetForexCacheForTests } from './fetch-preview-prices';

jest.mock('../../common/utils/finnhub-quote');
jest.mock('../../common/utils/twelve-data-quote');

const mockFinnhub = fetchFinnhubQuote as jest.Mock;
const mockTwelve = fetchTwelveDataQuote as jest.Mock;

function makeHelpers(): JobHelpers {
  return { addJob: jest.fn().mockResolvedValue(undefined) } as unknown as JobHelpers;
}

function makeCache(): PreviewCacheService {
  return { setPrices: jest.fn(), getPrices: jest.fn().mockReturnValue([]) } as unknown as PreviewCacheService;
}

function makeConfig(finnhubKey = 'finnhub-key', twelveKey = 'twelve-key'): ConfigService {
  return {
    getOrThrow: jest.fn((name: string) => (name === 'FINNHUB_API_KEY' ? finnhubKey : twelveKey)),
  } as unknown as ConfigService;
}

describe('makeFetchPreviewPricesTask', () => {
  beforeEach(() => {
    mockFinnhub.mockReset();
    mockTwelve.mockReset();
    __resetForexCacheForTests();
  });

  it('routes stock symbols through Finnhub and forex through Twelve Data', async () => {
    mockFinnhub.mockResolvedValue({ c: 100, pc: 98, t: 0 });
    mockTwelve.mockResolvedValue({ c: 0.6587, pc: 0.6531, t: 0 });

    const cache = makeCache();
    const task = makeFetchPreviewPricesTask(makeConfig(), cache);
    await task({}, makeHelpers());

    // VOO, AAPL, MSFT via Finnhub; OANDA:AUD_USD via Twelve Data
    expect(mockFinnhub).toHaveBeenCalledTimes(3);
    expect(mockTwelve).toHaveBeenCalledTimes(1);
    expect(mockTwelve).toHaveBeenCalledWith('AUD/USD', 'twelve-key');

    const [prices] = (cache.setPrices as jest.Mock).mock.calls[0] as [Array<{ symbol: string; price: number | null }>];
    const aud = prices.find(p => p.symbol === 'AUD/USD');
    expect(aud?.price).toBe(0.6587);
  });

  it('caches the forex quote for the TTL window — second invocation does not re-fetch Twelve Data', async () => {
    mockFinnhub.mockResolvedValue({ c: 100, pc: 98, t: 0 });
    mockTwelve.mockResolvedValue({ c: 0.6587, pc: 0.6531, t: 0 });

    const task = makeFetchPreviewPricesTask(makeConfig(), makeCache());
    await task({}, makeHelpers());
    await task({}, makeHelpers());

    expect(mockTwelve).toHaveBeenCalledTimes(1);
    expect(mockFinnhub).toHaveBeenCalledTimes(6); // 3 stocks × 2 runs
  });

  it('re-fetches forex after the 300-second TTL expires', async () => {
    mockFinnhub.mockResolvedValue({ c: 100, pc: 98, t: 0 });
    mockTwelve.mockResolvedValueOnce({ c: 0.6587, pc: 0.6531, t: 0 });
    mockTwelve.mockResolvedValueOnce({ c: 0.6601, pc: 0.6587, t: 0 });

    const realNow = Date.now;
    let now = 1_700_000_000_000;
    Date.now = jest.fn(() => now);

    try {
      const task = makeFetchPreviewPricesTask(makeConfig(), makeCache());
      await task({}, makeHelpers());

      now += 301_000; // past TTL
      await task({}, makeHelpers());

      expect(mockTwelve).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('sets price to null for a symbol whose quote call fails', async () => {
    mockFinnhub
      .mockResolvedValueOnce({ c: 200, pc: 195, t: 0 })
      .mockRejectedValueOnce(new Error('Finnhub error'))
      .mockResolvedValueOnce({ c: 300, pc: 295, t: 0 });
    mockTwelve.mockResolvedValue({ c: 0.64, pc: 0.63, t: 0 });

    const cache = makeCache();
    const task = makeFetchPreviewPricesTask(makeConfig(), cache);
    await task({}, makeHelpers());

    const [prices] = (cache.setPrices as jest.Mock).mock.calls[0] as [Array<{ symbol: string; price: number | null; percentChange: number | null }>];
    expect(prices[0].price).toBe(200);
    expect(prices[1].price).toBeNull();
    expect(prices[1].percentChange).toBeNull();
    expect(prices[2].price).toBe(300);
    expect(prices[3].price).toBe(0.64);
  });

  it('sets forex to null when Twelve Data throws', async () => {
    mockFinnhub.mockResolvedValue({ c: 100, pc: 98, t: 0 });
    mockTwelve.mockRejectedValue(new Error('rate limit'));

    const cache = makeCache();
    const task = makeFetchPreviewPricesTask(makeConfig(), cache);
    await task({}, makeHelpers());

    const [prices] = (cache.setPrices as jest.Mock).mock.calls[0] as [Array<{ symbol: string; price: number | null }>];
    expect(prices.find(p => p.symbol === 'AUD/USD')?.price).toBeNull();
  });

  it('computes 0% change when previous close is 0', async () => {
    mockFinnhub.mockResolvedValue({ c: 50, pc: 0, t: 0 });
    mockTwelve.mockResolvedValue({ c: 0.64, pc: 0.63, t: 0 });

    const cache = makeCache();
    const task = makeFetchPreviewPricesTask(makeConfig(), cache);
    await task({}, makeHelpers());

    const [prices] = (cache.setPrices as jest.Mock).mock.calls[0] as [Array<{ symbol: string; percentChange: number | null }>];
    expect(prices[0].percentChange).toBe(0);
  });

  it('self-reschedules via helpers.addJob after every run', async () => {
    mockFinnhub.mockResolvedValue({ c: 100, pc: 98, t: 0 });
    mockTwelve.mockResolvedValue({ c: 0.64, pc: 0.63, t: 0 });

    const helpers = makeHelpers();
    const task = makeFetchPreviewPricesTask(makeConfig(), makeCache());
    await task({}, helpers);

    expect(helpers.addJob).toHaveBeenCalledWith(
      'fetch-preview-prices',
      {},
      expect.objectContaining({ jobKey: 'preview-fetch', jobKeyMode: 'replace' }),
    );
  });

  it('schedules reschedule ~10s in the future', async () => {
    mockFinnhub.mockResolvedValue({ c: 100, pc: 98, t: 0 });
    mockTwelve.mockResolvedValue({ c: 0.64, pc: 0.63, t: 0 });
    const before = Date.now();

    const helpers = makeHelpers();
    const task = makeFetchPreviewPricesTask(makeConfig(), makeCache());
    await task({}, helpers);

    const after = Date.now();
    const { runAt } = (helpers.addJob as jest.Mock).mock.calls[0][2] as { runAt: Date };
    expect(runAt.getTime()).toBeGreaterThanOrEqual(before + 9_900);
    expect(runAt.getTime()).toBeLessThanOrEqual(after + 10_100);
  });
});
