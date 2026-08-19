import { Test } from '@nestjs/testing';
import { FinnhubService } from '../../finnhub/finnhub/finnhub.service.js';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';
import { WatchlistWarmupService } from './watchlist-warmup.service.js';

function makeSupabaseMock(result: { data: unknown; error: unknown }) {
  return {
    client: {
      from: jest.fn(() => ({ select: jest.fn().mockResolvedValue(result) })),
    },
  };
}

async function build(result: { data: unknown; error: unknown }) {
  const supabase = makeSupabaseMock(result);
  const finnhub = {
    ensureSubscribed: jest.fn().mockReturnValue(true),
    liveSubscriptionCount: jest.fn().mockReturnValue(0),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      WatchlistWarmupService,
      { provide: SupabaseService, useValue: supabase },
      { provide: FinnhubService, useValue: finnhub },
    ],
  }).compile();

  return { service: moduleRef.get(WatchlistWarmupService), supabase, finnhub };
}

describe('WatchlistWarmupService', () => {
  it('pins every distinct watchlist symbol at bootstrap', async () => {
    const { service, finnhub } = await build({
      data: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }],
      error: null,
    });

    await service.onApplicationBootstrap();

    expect(finnhub.ensureSubscribed).toHaveBeenCalledWith('AAPL');
    expect(finnhub.ensureSubscribed).toHaveBeenCalledWith('MSFT');
    expect(finnhub.ensureSubscribed).toHaveBeenCalledTimes(2);
  });

  it('deduplicates symbols differing only in case', async () => {
    const { service, finnhub } = await build({
      data: [{ symbol: 'AAPL' }, { symbol: 'aapl' }],
      error: null,
    });

    await service.onApplicationBootstrap();

    expect(finnhub.ensureSubscribed).toHaveBeenCalledTimes(1);
    expect(finnhub.ensureSubscribed).toHaveBeenCalledWith('AAPL');
  });

  it('reads watchlist_items — the query the Finnhub layer no longer makes', async () => {
    const { service, supabase } = await build({ data: [], error: null });

    await service.onApplicationBootstrap();

    expect(supabase.client.from).toHaveBeenCalledWith('watchlist_items');
  });

  it('does not throw when the query errors — a cold cache is a reported state', async () => {
    const { service, finnhub } = await build({ data: null, error: { code: 'PGRST301' } });

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(finnhub.ensureSubscribed).not.toHaveBeenCalled();
  });

  it('does not throw when the query returns null data with no error', async () => {
    const { service, finnhub } = await build({ data: null, error: null });

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(finnhub.ensureSubscribed).not.toHaveBeenCalled();
  });

  it('completes when the cap refuses some symbols', async () => {
    const { service, finnhub } = await build({
      data: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }],
      error: null,
    });
    finnhub.ensureSubscribed.mockReturnValueOnce(true).mockReturnValueOnce(false);

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(finnhub.ensureSubscribed).toHaveBeenCalledTimes(2);
  });
});
