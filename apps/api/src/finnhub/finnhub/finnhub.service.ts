import { forwardRef, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { PricesGateway } from '../../gateway/prices.gateway';
import { AlertsService } from '../../alerts/alerts/alerts.service';

@Injectable()
export class FinnhubService implements OnModuleInit {
  private readonly logger = new Logger(FinnhubService.name);
  private ws: WebSocket;
  private readonly subscriptions = new Set<string>();
  private reconnectDelay = 1000;
  private readonly maxDelay = 30000;

  constructor(
    private config: ConfigService,
    @Inject(forwardRef(() => PricesGateway)) private gateway: PricesGateway,
    @Inject(forwardRef(() => AlertsService)) private alertsService: AlertsService,
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
      for (const sym of this.subscriptions) {
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

  subscribe(symbol: string) {
    this.subscriptions.add(symbol);
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }

  unsubscribe(symbol: string) {
    this.subscriptions.delete(symbol);
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
    }
  }

  async getCandles(
    symbol: string,
    resolution: string,
    from: number,
    to: number,
  ): Promise<FinnhubCandles> {
    const apiKey = this.config.getOrThrow<string>('FINNHUB_API_KEY');
    const url =
      `https://finnhub.io/api/v1/stock/candle` +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&resolution=${encodeURIComponent(resolution)}` +
      `&from=${from}&to=${to}&token=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`Finnhub candles ${symbol} returned ${res.status}`);
      return { s: 'no_data' };
    }
    return (await res.json()) as FinnhubCandles;
  }
}

export interface FinnhubCandles {
  s: string;
  t?: number[];
  c?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
}
