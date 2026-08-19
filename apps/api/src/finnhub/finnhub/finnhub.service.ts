import { Injectable, OnModuleInit } from '@nestjs/common';
import { SecureLogger } from '../../common/logger/secure-logger.js';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { normalizeSymbol } from '@pulseticker/watchlist-rules';
import WebSocket from 'ws';

// Finnhub free plan: 1 concurrent WS connection per API key.
// reconnectDelay doubles on each close, up to maxDelay.
// On 429 (rate limited), floor is raised to minDelayAfter429.
// The backoff is only reset after the connection has been stable for
// stableWindowMs — resetting on 'open' alone causes a reconnect storm
// if the server closes the socket within seconds of accepting it.
const STABLE_WINDOW_MS = 60_000;
const MIN_DELAY_AFTER_429 = 60_000;

/**
 * Finnhub's free tier allows 50 concurrent symbol subscriptions per API key,
 * process-wide across every user. Past it, subscriptions silently stop working:
 * no error, no close, prices simply never arrive. This is why the cap is
 * enforced here rather than trusted — and why refusal is logged loudly.
 *
 * Distinct from MAX_WATCHLIST_SIZE, which is per user. Same value today, but
 * they answer different questions and must not be collapsed.
 */
const MAX_LIVE_SUBSCRIPTIONS = 50;

@Injectable()
export class FinnhubService implements OnModuleInit {
  private readonly logger = new SecureLogger(FinnhubService.name);
  private ws!: WebSocket;
  private readonly refCounts = new Map<string, number>();
  private readonly priceCache = new Map<string, { price: number; ts: number }>();
  private reconnectDelay = 1000;
  private readonly maxDelay = 30000;

  private stableTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnecting = false;

  /**
   * Symbols that stay subscribed regardless of who is connected — every symbol
   * on someone's watchlist. Held separately from refCounts because they are not
   * reference counted: pinning twice is the same as pinning once, which is what
   * makes ensureSubscribed() safe to call on every poll.
   */
  private readonly pinned = new Set<string>();

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
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
        this.logger.logData('Finnhub WS stable — backoff reset', {
          stableWindowMs: STABLE_WINDOW_MS,
        });
      }, STABLE_WINDOW_MS);

      for (const sym of this.wantedSymbols()) {
        this.ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      }
    });

    this.ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          data?: { s: string; p: number; t: number }[];
        };
        if (msg.type === 'trade' && msg.data) {
          for (const trade of msg.data) {
            this.priceCache.set(trade.s.toUpperCase(), { price: trade.p, ts: trade.t });
            this.eventEmitter.emit('price.received', {
              symbol: trade.s,
              price: trade.p,
              ts: trade.t,
            });
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

    this.ws.on('error', err => {
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
    const sym = normalizeSymbol(symbol);
    const prev = this.refCounts.get(sym) ?? 0;
    if (prev === 0 && !this.hasCapacityFor(sym)) return;
    this.refCounts.set(sym, prev + 1);
    if (prev === 0 && !this.pinned.has(sym)) this.send('subscribe', sym);
  }

  /**
   * Subscribe a symbol for as long as the process lives, idempotently.
   *
   * Watchlist membership is not client-scoped, so it cannot use the ref count:
   * a symbol added while no browser is connected would be subscribed and then
   * released on the next disconnect, and calling subscribe() per poll would
   * leak counts that nothing ever decrements. Returns false when the cap
   * refused it, so the caller can surface that.
   */
  ensureSubscribed(symbol: string): boolean {
    const sym = normalizeSymbol(symbol);
    if (this.pinned.has(sym)) return true;
    if (!this.hasCapacityFor(sym)) return false;
    const wasLive = (this.refCounts.get(sym) ?? 0) > 0;
    this.pinned.add(sym);
    if (!wasLive) this.send('subscribe', sym);
    return true;
  }

  /**
   * Drop a pin. The upstream unsubscribe is sent only if no connected client
   * still wants the symbol. Callers must confirm no other user tracks it —
   * pins are process-wide, not per user.
   */
  releasePin(symbol: string) {
    const sym = normalizeSymbol(symbol);
    if (!this.pinned.delete(sym)) return;
    if ((this.refCounts.get(sym) ?? 0) === 0) this.send('unsubscribe', sym);
  }

  /** Every symbol that should be live upstream: pinned, or wanted by a client. */
  private wantedSymbols(): string[] {
    return [...new Set([...this.pinned, ...this.refCounts.keys()])];
  }

  /** Live subscription count, for the cap and for operational logging. */
  liveSubscriptionCount(): number {
    return this.wantedSymbols().length;
  }

  private hasCapacityFor(sym: string): boolean {
    if (this.pinned.has(sym) || (this.refCounts.get(sym) ?? 0) > 0) return true;
    if (this.liveSubscriptionCount() < MAX_LIVE_SUBSCRIPTIONS) return true;
    this.logger.warnData('Finnhub subscription cap reached — symbol refused', {
      symbol: sym,
      cap: MAX_LIVE_SUBSCRIPTIONS,
    });
    return false;
  }

  private send(type: 'subscribe' | 'unsubscribe', symbol: string) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, symbol }));
    }
  }

  /**
   * Reference-counted unsubscribe. Sends an upstream unsubscribe only on
   * the 1 → 0 transition. A spurious unsubscribe (count already 0) is a
   * no-op so callers never need to track whether they ever subscribed.
   */
  unsubscribe(symbol: string) {
    const sym = normalizeSymbol(symbol);
    const prev = this.refCounts.get(sym) ?? 0;
    if (prev === 0) return;
    const next = prev - 1;
    if (next === 0) {
      this.refCounts.delete(sym);
      // A pinned symbol stays live even with no client connected.
      if (!this.pinned.has(sym)) this.send('unsubscribe', sym);
    } else {
      this.refCounts.set(sym, next);
    }
  }

  getLastKnownPrices(
    symbols: string[],
  ): Array<{ symbol: string; price: number | null; ts: number | null }> {
    return symbols.map(sym => {
      const cached = this.priceCache.get(sym.toUpperCase());
      return {
        symbol: sym.toUpperCase(),
        price: cached?.price ?? null,
        ts: cached?.ts ?? null,
      };
    });
  }
}
