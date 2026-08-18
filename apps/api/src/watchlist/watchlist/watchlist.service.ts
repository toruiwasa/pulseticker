import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WatchlistPricesResponse } from '@pulseticker/schemas';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';
import { FinnhubService } from '../../finnhub/finnhub/finnhub.service.js';
import { FinnhubQuote, fetchFinnhubQuote } from '../../common/utils/finnhub-quote.js';

const DEFAULT_SYMBOLS = ['VOO', 'AAPL', 'MSFT', 'OANDA:AUD_USD', 'OANDA:AUD_JPY'];
const MAX_WATCHLIST_SIZE = 50;
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

interface FinnhubSearchResult {
  symbol: string;
  description: string;
  type: string;
}

interface FinnhubForexSymbol {
  symbol: string;
  displaySymbol?: string;
  description: string;
}

export type { FinnhubQuote };

export interface SymbolSearchResult {
  symbol: string;
  description: string;
}

/** Shape of the columns findAll() selects. SupabaseClient carries no Database
 *  generic here, so its rows arrive as `any` and need naming to stay type-safe. */
interface WatchlistRow {
  id: string;
  symbol: string;
  created_at: string;
}

@Injectable()
export class WatchlistService {
  private oandaSymbols: SymbolSearchResult[] = [];

  constructor(
    private supabase: SupabaseService,
    private config: ConfigService,
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

    const { error: seedError } = await this.supabase.client
      .from('watchlist_items')
      .upsert(
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
      id:     row.id,
      symbol: prices[i].symbol,
      price:  prices[i].price,
      ts:     prices[i].ts,
    }));
    return { cached: items.length === 0 || items.some(i => i.price !== null), items };
  }

  private sym(s: string) { return s.toUpperCase(); }

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

  async searchSymbols(q: string): Promise<SymbolSearchResult[]> {
    await this.loadOandaSymbols();
    const [equities, fx] = await Promise.all([
      this.searchEquitiesOnFinnhub(q),
      Promise.resolve(this.searchOandaCache(q)),
    ]);
    return [...fx.slice(0, 5), ...equities].slice(0, 10);
  }

  async getQuote(symbol: string): Promise<FinnhubQuote> {
    const key = this.config.getOrThrow<string>('FINNHUB_API_KEY');
    return fetchFinnhubQuote(symbol, key);
  }

  private async loadOandaSymbols(): Promise<void> {
    if (this.oandaSymbols.length > 0) return;
    const key = this.config.getOrThrow<string>('FINNHUB_API_KEY');
    const res = await fetch(`${FINNHUB_BASE}/forex/symbol?exchange=oanda&token=${key}`);
    if (!res.ok) return;
    const json = (await res.json()) as FinnhubForexSymbol[];
    this.oandaSymbols = (json ?? []).map(r => ({
      symbol: r.symbol,
      description: r.displaySymbol || r.description,
    }));
  }

  private async searchEquitiesOnFinnhub(q: string): Promise<SymbolSearchResult[]> {
    const key = this.config.getOrThrow<string>('FINNHUB_API_KEY');
    const res = await fetch(`${FINNHUB_BASE}/search?q=${encodeURIComponent(q)}&token=${key}`);
    if (!res.ok) throw new Error(`Finnhub search failed: ${res.status}`);
    const json = (await res.json()) as { result?: FinnhubSearchResult[] };
    return (json.result ?? [])
      .filter(r => r.type === 'Common Stock' || r.type === 'ETP')
      .map(({ symbol, description }) => ({ symbol, description }));
  }

  private searchOandaCache(q: string): SymbolSearchResult[] {
    const tokens = q.toLowerCase().split(/[\s\/_]+/).filter(Boolean);
    if (tokens.length === 0) return [];
    return this.oandaSymbols.filter(s => {
      const haystack = `${s.symbol} ${s.description}`.toLowerCase();
      return tokens.every(t => haystack.includes(t));
    });
  }
}
