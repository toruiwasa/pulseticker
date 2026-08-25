import { Test } from '@nestjs/testing';
import { SubscriptionRegistry } from '../../finnhub/finnhub/subscription-registry.js';
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
  const subscriptions = {
    ensureSubscribed: jest.fn().mockReturnValue(true),
    liveSubscriptionCount: jest.fn().mockReturnValue(0),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      WatchlistWarmupService,
      { provide: SupabaseService, useValue: supabase },
      { provide: SubscriptionRegistry, useValue: subscriptions },
    ],
  }).compile();

  return { service: moduleRef.get(WatchlistWarmupService), supabase, subscriptions };
}

describe('WatchlistWarmupService', () => {
  it('pins every distinct watchlist symbol at bootstrap', async () => {
    const { service, subscriptions } = await build({
      data: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }],
      error: null,
    });

    await service.onApplicationBootstrap();

    expect(subscriptions.ensureSubscribed).toHaveBeenCalledWith('AAPL');
    expect(subscriptions.ensureSubscribed).toHaveBeenCalledWith('MSFT');
    expect(subscriptions.ensureSubscribed).toHaveBeenCalledTimes(2);
  });

  it('deduplicates symbols differing only in case', async () => {
    const { service, subscriptions } = await build({
      data: [{ symbol: 'AAPL' }, { symbol: 'aapl' }],
      error: null,
    });

    await service.onApplicationBootstrap();

    expect(subscriptions.ensureSubscribed).toHaveBeenCalledTimes(1);
    expect(subscriptions.ensureSubscribed).toHaveBeenCalledWith('AAPL');
  });

  it('reads watchlist_items — the query the Finnhub layer no longer makes', async () => {
    const { service, supabase } = await build({ data: [], error: null });

    await service.onApplicationBootstrap();

    expect(supabase.client.from).toHaveBeenCalledWith('watchlist_items');
  });

  it('does not throw when the query errors — a cold cache is a reported state', async () => {
    const { service, subscriptions } = await build({ data: null, error: { code: 'PGRST301' } });

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(subscriptions.ensureSubscribed).not.toHaveBeenCalled();
  });

  it('does not throw when the query returns null data with no error', async () => {
    const { service, subscriptions } = await build({ data: null, error: null });

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(subscriptions.ensureSubscribed).not.toHaveBeenCalled();
  });

  it('completes when the cap refuses some symbols', async () => {
    const { service, subscriptions } = await build({
      data: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }],
      error: null,
    });
    subscriptions.ensureSubscribed.mockReturnValueOnce(true).mockReturnValueOnce(false);

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(subscriptions.ensureSubscribed).toHaveBeenCalledTimes(2);
  });
});
