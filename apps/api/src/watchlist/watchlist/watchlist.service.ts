import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { WatchlistPricesResponse } from '@pulseticker/schemas';
import {
  canAdd,
  DEFAULT_SYMBOLS,
  MAX_WATCHLIST_SIZE,
  needsSeeding,
  normalizeSymbol,
} from '@pulseticker/watchlist-rules';
import { SecureLogger } from '../../common/logger/secure-logger.js';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';
import { FinnhubService } from '../../finnhub/finnhub/finnhub.service.js';

/** Shape of the columns findAll() selects. SupabaseClient carries no Database
 *  generic here, so its rows arrive as `any` and need naming to stay type-safe. */
interface WatchlistRow {
  id: string;
  symbol: string;
  created_at: string;
}

/**
 * The symbols a user tracks, and the last price seen for each.
 *
 * Instrument-catalog queries (symbol search, quote lookup) belong to
 * SymbolSearchService — they are user-independent and do not touch Supabase.
 */
@Injectable()
export class WatchlistService {
  private readonly logger = new SecureLogger(WatchlistService.name);

  constructor(
    private supabase: SupabaseService,
    private finnhub: FinnhubService,
  ) {}

  async findAll(userId: string) {
    const { data: profile, error: profileError } = await this.supabase.client
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data, error } = await this.supabase.client
      .from('watchlist_items')
      .select('id, symbol, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    if (!needsSeeding({ hasProfile: !!profile })) return data;

    const { error: seedError } = await this.supabase.client.from('watchlist_items').upsert(
      DEFAULT_SYMBOLS.map(symbol => ({ user_id: userId, symbol })),
      { onConflict: 'user_id,symbol', ignoreDuplicates: true },
    );
    if (seedError) throw seedError;

    const { error: profileInsertError } = await this.supabase.client
      .from('user_profiles')
      .insert({ user_id: userId });
    if (profileInsertError) throw profileInsertError;

    const { data: seeded, error: refetchError } = await this.supabase.client
      .from('watchlist_items')
      .select('id, symbol, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (refetchError) throw refetchError;
    return seeded;
  }

  /**
   * Watchlist rows decorated with the last price seen on the Finnhub WS.
   *
   * Rows come from findAll() rather than a plain select so default-symbol seeding
   * still fires for a user whose first-ever sign-in is on mobile — REQ-17 Phase 1
   * never calls GET /watchlist.
   *
   * No Finnhub REST fallback on a cache miss (REQ-17). `cached: false` therefore
   * means the cache yielded nothing at all — a Render cold start — not that one
   * individual symbol happens to be missing a price.
   */
  async getWatchlistPrices(userId: string): Promise<WatchlistPricesResponse> {
    const rows = (await this.findAll(userId)) as WatchlistRow[];
    const prices = this.finnhub.getLastKnownPrices(rows.map(r => r.symbol));
    const items = rows.map((row, i) => ({
      id: row.id,
      symbol: prices[i].symbol,
      price: prices[i].price,
      ts: prices[i].ts,
    }));
    return { cached: items.length === 0 || items.some(i => i.price !== null), items };
  }

  async create(userId: string, symbol: string) {
    const { count, error: countError } = await this.supabase.client
      .from('watchlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (countError) throw countError;
    if (!canAdd({ count: count ?? 0 })) {
      throw new BadRequestException(`Watchlist limit of ${MAX_WATCHLIST_SIZE} symbols reached`);
    }

    const { data, error } = await this.supabase.client
      .from('watchlist_items')
      .insert({ user_id: userId, symbol: normalizeSymbol(symbol) })
      .select('id, symbol, created_at')
      .single();
    if (error) {
      if (error.code === '23505') throw new ConflictException(`${symbol} already in watchlist`);
      throw error;
    }

    // Pin the symbol so it stays on the Finnhub feed with no browser connected.
    // Without this a symbol added post-boot is subscribed only while a web
    // client holds it, and mobile — which polls REST and never opens a socket —
    // would read price: null for it until the next restart.
    if (!this.finnhub.ensureSubscribed(normalizeSymbol(symbol))) {
      this.logger.warnData('Symbol added but not subscribed — Finnhub cap reached', {
        symbol: normalizeSymbol(symbol),
      });
    }

    return data;
  }

  async remove(userId: string, symbol: string) {
    const sym = normalizeSymbol(symbol);
    const { error } = await this.supabase.client
      .from('watchlist_items')
      .delete()
      .eq('user_id', userId)
      .eq('symbol', sym);
    if (error) throw error;

    // Pins are process-wide, so the symbol may still be on another user's
    // watchlist. Releasing without this check would silently stop their prices;
    // never releasing would let the pin set grow until the cap fills and stay
    // full until the next restart.
    const { count, error: countError } = await this.supabase.client
      .from('watchlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('symbol', sym);
    if (countError) {
      this.logger.warnData('Could not confirm symbol is unused — pin retained', {
        code: countError.code,
      });
      return;
    }
    if ((count ?? 0) === 0) this.finnhub.releasePin(sym);
  }
}
