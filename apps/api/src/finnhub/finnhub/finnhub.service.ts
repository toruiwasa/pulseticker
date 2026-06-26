import { Injectable, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { SecureLogger } from '../../common/logger/secure-logger.js';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';

// Finnhub free plan: 1 concurrent WS connection per API key.
// reconnectDelay doubles on each close, up to maxDelay.
// On 429 (rate limited), floor is raised to minDelayAfter429.
// The backoff is only reset after the connection has been stable for
// stableWindowMs — resetting on 'open' alone causes a reconnect storm
// if the server closes the socket within seconds of accepting it.
const STABLE_WINDOW_MS    = 60_000;
const MIN_DELAY_AFTER_429 = 60_000;

@Injectable()
export class FinnhubService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new SecureLogger(FinnhubService.name);
  private ws: WebSocket;
  private readonly refCounts = new Map<string, number>();
  private readonly priceCache = new Map<string, { price: number; ts: number }>();
  private reconnectDelay = 1000;
  private readonly maxDelay = 30000;

  private stableTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnecting = false;

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
    private supabase: SupabaseService,
  ) {}

  onModuleInit() {
    this.connect();
  }

  private connect() {
    this.reconnecting = false;
    const apiKey = this.config.getOrThrow<string>('FINNHUB_API_KEY');
    this.ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);

    this.ws.on('open', () => {
      this.logger.log('Finnhub WS connected');
      // Only reset backoff after the connection is stable for STABLE_WINDOW_MS.
      // Resetting immediately on 'open' causes a reconnect storm when Finnhub
      // closes the socket a few seconds later (e.g. rate-limiting the prior session).
      clearTimeout(this.stableTimer);
      this.stableTimer = setTimeout(() => {
        this.reconnectDelay = 1000;
        this.logger.logData('Finnhub WS stable — backoff reset', { stableWindowMs: STABLE_WINDOW_MS });
      }, STABLE_WINDOW_MS);

      for (const sym of this.refCounts.keys()) {
        this.ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      }
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; data?: { s: string; p: number; t: number }[] };
        if (msg.type === 'trade' && msg.data) {
          for (const trade of msg.data) {
            this.priceCache.set(trade.s.toUpperCase(), { price: trade.p, ts: trade.t });
            this.eventEmitter.emit('price.received', { symbol: trade.s, price: trade.p, ts: trade.t });
          }
        }
      } catch {
        this.logger.warn('Unparseable Finnhub message');
      }
    });

    this.ws.on('close', () => {
      clearTimeout(this.stableTimer);
      // Guard against double scheduling: error handler calls ws.close(),
      // which fires this close event. Skip if already scheduled.
      if (this.reconnecting) return;
      this.reconnecting = true;
      this.logger.warn(`Finnhub WS closed — reconnecting in ${this.reconnectDelay}ms`);
      setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
        this.connect();
      }, this.reconnectDelay);
    });

    this.ws.on('error', (err) => {
      if (err.message.includes('429')) {
        // 429 is an expected Finnhub rate-limit response — raise the floor and warn only.
        this.reconnectDelay = Math.max(this.reconnectDelay, MIN_DELAY_AFTER_429);
        this.logger.warnData('Finnhub rate limited (429) — extended backoff', {
          reconnectDelayMs: this.reconnectDelay,
        });
      } else {
        this.logger.error('Finnhub WS error', err.message);
      }
      this.ws.close();
    });
  }

  /**
   * Reference-counted subscribe. Sends an upstream subscribe only on the
   * 0 → 1 transition, so watchlist CRUD and the live-candle cache can both
   * call subscribe(symbol) safely without fighting over the WS state.
   */
  subscribe(symbol: string) {
    const prev = this.refCounts.get(symbol) ?? 0;
    this.refCounts.set(symbol, prev + 1);
    if (prev === 0 && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }

  /**
   * Reference-counted unsubscribe. Sends an upstream unsubscribe only on
   * the 1 → 0 transition. A spurious unsubscribe (count already 0) is a
   * no-op so callers never need to track whether they ever subscribed.
   */
  unsubscribe(symbol: string) {
    const prev = this.refCounts.get(symbol) ?? 0;
    if (prev === 0) return;
    const next = prev - 1;
    if (next === 0) {
      this.refCounts.delete(symbol);
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
      }
    } else {
      this.refCounts.set(symbol, next);
    }
  }

  getLastKnownPrices(symbols: string[]): Array<{ symbol: string; price: number | null; ts: number | null }> {
    return symbols.map(sym => {
      const cached = this.priceCache.get(sym.toUpperCase());
      return {
        symbol: sym.toUpperCase(),
        price: cached?.price ?? null,
        ts: cached?.ts ?? null,
      };
    });
  }

  async onApplicationBootstrap() {
    const { data, error } = await this.supabase.client
      .from('watchlist_items')
      .select('symbol');

    if (error) {
      this.logger.errorData('Warm-up failed to load watchlist symbols', { code: error.code });
      return;
    }

    if (!data) {
      this.logger.warn('Warm-up: watchlist_items returned null — no symbols pre-subscribed');
      return;
    }

    const symbols = [...new Set((data as { symbol: string }[]).map(row => row.symbol.toUpperCase()))];
    for (const symbol of symbols) {
      this.subscribe(symbol);
    }
    this.logger.logData('Finnhub warm-up complete', { symbolCount: symbols.length });
  }
}
