import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FinnhubQuote, fetchFinnhubQuote } from '../../common/utils/finnhub-quote.js';

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

export interface SymbolSearchResult {
  symbol: string;
  description: string;
}

/**
 * The instrument catalog: which symbols exist and what one is worth right now.
 *
 * A different noun from WatchlistService's "the symbols this user tracks" — these
 * queries are user-independent and answered entirely by Finnhub REST, so they carry
 * no Supabase dependency and no RLS concern.
 */
@Injectable()
export class SymbolSearchService {
  private oandaSymbols: SymbolSearchResult[] = [];

  constructor(private config: ConfigService) {}

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
    const tokens = q
      .toLowerCase()
      .split(/[\s\/_]+/)
      .filter(Boolean);
    if (tokens.length === 0) return [];
    return this.oandaSymbols.filter(s => {
      const haystack = `${s.symbol} ${s.description}`.toLowerCase();
      return tokens.every(t => haystack.includes(t));
    });
  }
}
