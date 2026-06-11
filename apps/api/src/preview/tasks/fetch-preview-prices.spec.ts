import { ConfigService } from '@nestjs/config';
import { JobHelpers } from 'graphile-worker';
import { fetchFinnhubQuote } from '../../common/utils/finnhub-quote';
import { PreviewCacheService } from '../preview-cache.service';
import { makeFetchPreviewPricesTask } from './fetch-preview-prices';

jest.mock('../../common/utils/finnhub-quote');

const mockFetch = fetchFinnhubQuote as jest.Mock;

function makeHelpers(): JobHelpers {
  return { addJob: jest.fn().mockResolvedValue(undefined) } as unknown as JobHelpers;
}

function makeCache(): PreviewCacheService {
  return { setPrices: jest.fn(), getPrices: jest.fn().mockReturnValue([]) } as unknown as PreviewCacheService;
}

function makeConfig(key = 'test-key'): ConfigService {
  return { getOrThrow: jest.fn().mockReturnValue(key) } as unknown as ConfigService;
}

describe('makeFetchPreviewPricesTask', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches 4 quotes and calls setPrices', async () => {
    mockFetch.mockResolvedValue({ c: 100, pc: 98, t: 0 });

    const cache = makeCache();
    const task = makeFetchPreviewPricesTask(makeConfig(), cache);
    await task({}, makeHelpers());

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(cache.setPrices).toHaveBeenCalledTimes(1);
    const [prices] = (cache.setPrices as jest.Mock).mock.calls[0] as [ReturnType<PreviewCacheService['getPrices']>];
    expect(prices).toHaveLength(4);
    expect(prices[0].price).toBe(100);
    expect(prices[0].percentChange).toBeCloseTo((100 - 98) / 98 * 100);
  });

  it('sets price to null for a symbol whose quote call fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ c: 200, pc: 195, t: 0 })
      .mockRejectedValueOnce(new Error('Finnhub error'))
      .mockResolvedValueOnce({ c: 300, pc: 295, t: 0 })
      .mockResolvedValueOnce({ c: 0.64, pc: 0.63, t: 0 });

    const cache = makeCache();
    const task = makeFetchPreviewPricesTask(makeConfig(), cache);
    await task({}, makeHelpers());

    const [prices] = (cache.setPrices as jest.Mock).mock.calls[0] as [ReturnType<PreviewCacheService['getPrices']>];
    expect(prices[0].price).toBe(200);
    expect(prices[1].price).toBeNull();
    expect(prices[1].percentChange).toBeNull();
    expect(prices[2].price).toBe(300);
    expect(prices[3].price).toBe(0.64);
  });

  it('computes 0% change when previous close is 0', async () => {
    mockFetch.mockResolvedValue({ c: 50, pc: 0, t: 0 });

    const cache = makeCache();
    const task = makeFetchPreviewPricesTask(makeConfig(), cache);
    await task({}, makeHelpers());

    const [prices] = (cache.setPrices as jest.Mock).mock.calls[0] as [ReturnType<PreviewCacheService['getPrices']>];
    expect(prices[0].percentChange).toBe(0);
  });

  it('self-reschedules via helpers.addJob after every run', async () => {
    mockFetch.mockResolvedValue({ c: 100, pc: 98, t: 0 });

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
    mockFetch.mockResolvedValue({ c: 100, pc: 98, t: 0 });
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
