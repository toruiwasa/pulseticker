import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FinnhubService } from '../finnhub/finnhub/finnhub.service.js';
import { CandlePoint, ChartRange } from './chart.types.js';
import { TwelveDataService } from './twelve-data.service.js';

interface CacheEntry {
  candles: CandlePoint[];
  lastAccessed: number;
}

type CacheKey = `${string}:${ChartRange}`;

const TTL_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;
const MAX_POINTS = 30_000;

@Injectable()
export class LiveCandleCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveCandleCacheService.name);
  private readonly cache = new Map<CacheKey, CacheEntry>();
  private readonly inflight = new Map<CacheKey, Promise<CandlePoint[]>>();
  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private twelveData: TwelveDataService,
    private finnhub: FinnhubService,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
  }

  /**
   * Fetch candles for (symbol, range). On hit, returns the cached array
   * instantly and resets lastAccessed. On miss, fetches from Twelve Data,
   * starts a live Finnhub subscription, and de-dupes concurrent misses
   * via a per-key in-flight promise so the 800 req/day budget is preserved.
   */
  async getCandles(symbol: string, range: ChartRange): Promise<CandlePoint[]> {
    const key = this.keyFor(symbol, range);
    const hit = this.cache.get(key);
    if (hit) {
      hit.lastAccessed = Date.now();
      return hit.candles;
    }

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const fetchPromise = this.loadAndStore(key, symbol, range);
    this.inflight.set(key, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      this.inflight.delete(key);
    }
  }

  @OnEvent('price.received')
  handlePriceReceived(payload: { symbol: string; price: number; ts: number }) {
    this.applyTick(payload.symbol, payload.price, payload.ts);
  }

  /**
   * Apply a Finnhub tick: for every cached range for this symbol, update
   * the rightmost candle's value in place. The bucket time is not changed
   * so lightweight-charts' duplicate-time guard accepts the update.
   */
  applyTick(symbol: string, price: number, _ts: number): void {
    for (const [key, entry] of this.cache) {
      if (!key.startsWith(`${symbol}:`)) continue;
      const last = entry.candles[entry.candles.length - 1];
      if (!last) continue;
      last.value = price;
    }
  }

  private async loadAndStore(key: CacheKey, symbol: string, range: ChartRange): Promise<CandlePoint[]> {
    const candles = await this.twelveData.getTimeSeries(symbol, range);
    const bounded = candles.length > MAX_POINTS ? candles.slice(-MAX_POINTS) : candles;
    this.cache.set(key, { candles: bounded, lastAccessed: Date.now() });
    this.finnhub.subscribe(symbol);
    return bounded;
  }

  private sweep() {
    const cutoff = Date.now() - TTL_MS;
    const evictionCounts = new Map<string, number>();
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < cutoff) {
        this.cache.delete(key);
        const symbol = key.slice(0, key.lastIndexOf(':'));
        evictionCounts.set(symbol, (evictionCounts.get(symbol) ?? 0) + 1);
      }
    }
    for (const [symbol, count] of evictionCounts) {
      for (let i = 0; i < count; i++) this.finnhub.unsubscribe(symbol);
      this.logger.debug(`Evicted ${symbol} (${count} range${count === 1 ? '' : 's'})`);
    }
  }

  private keyFor(symbol: string, range: ChartRange): CacheKey {
    return `${symbol}:${range}`;
  }
}
