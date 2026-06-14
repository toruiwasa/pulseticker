import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SecureLogger } from '../../common/logger/secure-logger';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { PricesGateway } from '../../gateway/prices.gateway';
import { AlertsService } from '../../alerts/alerts/alerts.service';
import { LiveCandleCacheService } from '../../chart/live-candle-cache.service';

@Injectable()
export class FinnhubService implements OnModuleInit {
  private readonly logger = new SecureLogger(FinnhubService.name);
  private ws: WebSocket;
  private readonly refCounts = new Map<string, number>();
  private reconnectDelay = 1000;
  private readonly maxDelay = 30000;

  constructor(
    private config: ConfigService,
    @Inject(forwardRef(() => PricesGateway)) private gateway: PricesGateway,
    @Inject(forwardRef(() => AlertsService)) private alertsService: AlertsService,
    @Inject(forwardRef(() => LiveCandleCacheService)) private cache: LiveCandleCacheService,
  ) {}

  onModuleInit() {
    this.connect();
  }

  private connect() {
    const apiKey = this.config.getOrThrow<string>('FINNHUB_API_KEY');
    this.ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);

    this.ws.on('open', () => {
      this.logger.log('Finnhub WS connected');
      this.reconnectDelay = 1000;
      for (const sym of this.refCounts.keys()) {
        this.ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      }
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; data?: { s: string; p: number; t: number }[] };
        if (msg.type === 'trade' && msg.data) {
          for (const trade of msg.data) {
            this.gateway.broadcastPrice(trade.s, trade.p, trade.t);
            this.alertsService.checkAlerts(trade.s, trade.p);
            this.cache.applyTick(trade.s, trade.p, trade.t);
          }
        }
      } catch {
        this.logger.warn('Unparseable Finnhub message');
      }
    });

    this.ws.on('close', () => {
      this.logger.warn(`Finnhub WS closed — reconnecting in ${this.reconnectDelay}ms`);
      setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
        this.connect();
      }, this.reconnectDelay);
    });

    this.ws.on('error', (err) => {
      this.logger.error('Finnhub WS error', err.message);
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
}
