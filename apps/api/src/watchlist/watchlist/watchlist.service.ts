import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { WatchlistPricesResponse } from '@pulseticker/schemas';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';
import { FinnhubService } from '../../finnhub/finnhub/finnhub.service.js';

const DEFAULT_SYMBOLS = ['VOO', 'AAPL', 'MSFT', 'OANDA:AUD_USD', 'OANDA:AUD_JPY'];
const MAX_WATCHLIST_SIZE = 50;

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

    if (profile) return data;

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

  private sym(s: string) {
    return s.toUpperCase();
  }

  async create(userId: string, symbol: string) {
    const { count, error: countError } = await this.supabase.client
      .from('watchlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_WATCHLIST_SIZE) {
      throw new BadRequestException(`Watchlist limit of ${MAX_WATCHLIST_SIZE} symbols reached`);
    }

    const { data, error } = await this.supabase.client
      .from('watchlist_items')
      .insert({ user_id: userId, symbol: this.sym(symbol) })
      .select('id, symbol, created_at')
      .single();
    if (error) {
      if (error.code === '23505') throw new ConflictException(`${symbol} already in watchlist`);
      throw error;
    }
    return data;
  }

  async remove(userId: string, symbol: string) {
    const { error } = await this.supabase.client
      .from('watchlist_items')
      .delete()
      .eq('user_id', userId)
      .eq('symbol', this.sym(symbol));
    if (error) throw error;
  }
}
