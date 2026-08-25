import { Injectable, OnModuleInit } from '@nestjs/common';
import { SecureLogger } from '../../common/logger/secure-logger.js';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
 * WebSocket transport to Finnhub only: connect, reconnect backoff, 429
 * handling, and parsing trade messages into `price.received` events. Holds
 * no subscription state and no price cache — those belong to
 * SubscriptionRegistry and PriceCacheService. This class does not know what
 * a "wanted symbol" is; onOpen() lets those classes replay their own state
 * on every (re)connect without this class knowing why.
 */
@Injectable()
export class FinnhubClient implements OnModuleInit {
  private readonly logger = new SecureLogger(FinnhubClient.name);
  private ws!: WebSocket;
  private reconnectDelay = 1000;
  private readonly maxDelay = 30000;

  private stableTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnecting = false;

  /** Invoked every time the WS transitions to OPEN — first connect and every
   *  reconnect — so subscription state living elsewhere can be replayed. */
  private readonly openListeners: Array<() => void> = [];

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.connect();
  }

  /** Register a callback fired on every WS open, including the first. */
  onOpen(cb: () => void) {
    this.openListeners.push(cb);
  }

  /** Send a subscribe/unsubscribe frame. No-ops silently if the socket isn't
   *  OPEN — callers don't need to track connection state themselves. */
  send(type: 'subscribe' | 'unsubscribe', symbol: string) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, symbol }));
    }
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

      for (const listener of this.openListeners) listener();
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        // RawData is Buffer | ArrayBuffer | Buffer[]. String() on the latter two
        // yields '[object Object]', which would silently drop every trade.
        const text = Array.isArray(data)
          ? Buffer.concat(data).toString('utf8')
          : data instanceof ArrayBuffer
            ? Buffer.from(data).toString('utf8')
            : data.toString('utf8');
        const msg = JSON.parse(text) as {
          type: string;
          data?: { s: string; p: number; t: number }[];
        };
        if (msg.type === 'trade' && msg.data) {
          for (const trade of msg.data) {
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
}
