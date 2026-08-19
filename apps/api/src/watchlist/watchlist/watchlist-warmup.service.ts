import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { normalizeSymbol } from '@pulseticker/watchlist-rules';
import { SecureLogger } from '../../common/logger/secure-logger.js';
import { FinnhubService } from '../../finnhub/finnhub/finnhub.service.js';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';

/**
 * Pins every symbol on someone's watchlist to the Finnhub feed at boot.
 *
 * This used to live in FinnhubService.onApplicationBootstrap(), which meant the
 * transport layer queried `watchlist_items` — the only reason it depended on
 * Supabase at all, and a dependency pointing the wrong way. The Finnhub side
 * should not know what a watchlist is; the watchlist side already does.
 *
 * Failure is non-fatal and logged: the price cache simply starts cold, which is
 * a state GET /watchlist/prices already reports as `cached: false`.
 */
@Injectable()
export class WatchlistWarmupService implements OnApplicationBootstrap {
  private readonly logger = new SecureLogger(WatchlistWarmupService.name);

  constructor(
    private supabase: SupabaseService,
    private finnhub: FinnhubService,
  ) {}

  async onApplicationBootstrap() {
    const { data, error } = await this.supabase.client.from('watchlist_items').select('symbol');

    if (error) {
      this.logger.errorData('Warm-up failed to load watchlist symbols', { code: error.code });
      return;
    }

    if (!data) {
      this.logger.warn('Warm-up: watchlist_items returned null — no symbols pre-subscribed');
      return;
    }

    const symbols = [...new Set(data.map(row => normalizeSymbol(row.symbol)))];
    const refused = symbols.filter(symbol => !this.finnhub.ensureSubscribed(symbol)).length;

    this.logger.logData('Finnhub warm-up complete', {
      symbolCount: symbols.length,
      refused,
      liveSubscriptions: this.finnhub.liveSubscriptionCount(),
    });
  }
}
