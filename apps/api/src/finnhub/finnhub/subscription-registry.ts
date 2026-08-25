import { Injectable } from '@nestjs/common';
import { normalizeSymbol } from '@pulseticker/watchlist-rules';
import { SecureLogger } from '../../common/logger/secure-logger.js';
import { FinnhubClient } from './finnhub.client.js';

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

/**
 * Owns "who wants which symbol live upstream": ref-counted client interest
 * plus pinned (watchlist) membership, and the 50-symbol cap over their union.
 * Instructs FinnhubClient what to send; never touches the WebSocket itself.
 *
 * Registers with the client's onOpen() hook at construction time — not in
 * onModuleInit() — so the full wanted-symbol set replays on every (re)connect,
 * including the very first one, without depending on Nest's onModuleInit
 * ordering between this provider and its FinnhubClient dependency.
 */
@Injectable()
export class SubscriptionRegistry {
  private readonly logger = new SecureLogger(SubscriptionRegistry.name);
  private readonly refCounts = new Map<string, number>();

  /**
   * Symbols that stay subscribed regardless of who is connected — every symbol
   * on someone's watchlist. Held separately from refCounts because they are not
   * reference counted: pinning twice is the same as pinning once, which is what
   * makes ensureSubscribed() safe to call on every poll.
   */
  private readonly pinned = new Set<string>();

  /** Symbols whose refusal has been logged, so the 15 s price poll retrying a
   *  refused symbol produces one warning, not one per attempt. A symbol is
   *  cleared on any successful subscription, so a later refusal logs again. */
  private readonly refusalLogged = new Set<string>();

  constructor(private client: FinnhubClient) {
    this.client.onOpen(() => this.resubscribeAll());
  }

  /**
   * Reference-counted subscribe. Sends an upstream subscribe only on the
   * 0 → 1 transition, so watchlist CRUD and the live-candle cache can both
   * call subscribe(symbol) safely without fighting over the WS state.
   */
  subscribe(symbol: string): boolean {
    const sym = normalizeSymbol(symbol);
    const prev = this.refCounts.get(sym) ?? 0;
    if (prev === 0 && !this.hasCapacityFor(sym)) return false;
    this.refCounts.set(sym, prev + 1);
    if (prev === 0 && !this.pinned.has(sym)) this.client.send('subscribe', sym);
    return true;
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
      if (!this.pinned.has(sym)) this.client.send('unsubscribe', sym);
    } else {
      this.refCounts.set(sym, next);
    }
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
    if (!wasLive) this.client.send('subscribe', sym);
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
    if ((this.refCounts.get(sym) ?? 0) === 0) this.client.send('unsubscribe', sym);
  }

  /** Live subscription count, for the cap and for operational logging. */
  liveSubscriptionCount(): number {
    return this.wantedSymbols().length;
  }

  /** Replays the full wanted-symbol set upstream — called on every WS open. */
  private resubscribeAll() {
    for (const sym of this.wantedSymbols()) {
      this.client.send('subscribe', sym);
    }
  }

  /** Every symbol that should be live upstream: pinned, or wanted by a client. */
  private wantedSymbols(): string[] {
    return [...new Set([...this.pinned, ...this.refCounts.keys()])];
  }

  private hasCapacityFor(sym: string): boolean {
    if (this.pinned.has(sym) || (this.refCounts.get(sym) ?? 0) > 0) {
      this.refusalLogged.delete(sym);
      return true;
    }
    if (this.liveSubscriptionCount() < MAX_LIVE_SUBSCRIPTIONS) {
      this.refusalLogged.delete(sym);
      return true;
    }
    if (!this.refusalLogged.has(sym)) {
      this.refusalLogged.add(sym);
      this.logger.warnData('Finnhub subscription cap reached — symbol refused', {
        symbol: sym,
        cap: MAX_LIVE_SUBSCRIPTIONS,
      });
    }
    return false;
  }
}
