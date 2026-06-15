import { Injectable } from '@nestjs/common';
import { CandlePoint, ChartRange } from './chart.types.js';
import { LiveCandleCacheService } from './live-candle-cache.service.js';

@Injectable()
export class ChartService {
  constructor(private cache: LiveCandleCacheService) {}

  getCandles(symbol: string, range: ChartRange): Promise<CandlePoint[]> {
    return this.cache.getCandles(symbol, range);
  }
}
