import { Controller, Get, Sse } from '@nestjs/common';
import { Observable, concat, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { LiveCandleCacheService } from '../chart/live-candle-cache.service';
import { CandlePoint } from '../chart/chart.types';
import { PreviewCacheService, PreviewPrice } from './preview-cache.service';

export interface PreviewSnapshot {
  prices:  PreviewPrice[];
  candles: CandlePoint[] | null;
}

@Controller('preview')
export class PreviewController {
  constructor(
    private readonly cache: PreviewCacheService,
    private readonly candleCache: LiveCandleCacheService,
  ) {}

  @Get('prices')
  async getPrices(): Promise<PreviewSnapshot> {
    const candles = await this.candleCache.getCandles('AAPL', '1D');
    return { prices: this.cache.getPrices(), candles };
  }

  @Sse('prices/stream')
  stream(): Observable<MessageEvent> {
    // First message: fetch AAPL 1D candles from the already-warm cache,
    // embed them so the login chart can seed history without a separate
    // authenticated API call.
    const first$ = from(this.candleCache.getCandles('AAPL', '1D')).pipe(
      map(candles => ({
        data: { prices: this.cache.getPrices(), candles } satisfies PreviewSnapshot,
      }) as MessageEvent),
    );

    // Subsequent messages: tick-only, no candle payload
    const ticks$ = this.cache.prices$.pipe(
      map(prices => ({
        data: { prices, candles: null } satisfies PreviewSnapshot,
      }) as MessageEvent),
    );

    return concat(first$, ticks$);
  }
}
