import { Injectable } from '@nestjs/common';
import type { PricePoint } from '@pulseticker/schemas';
import { ChartRange } from './chart.types.js';
import { LiveCandleCacheService } from './live-candle-cache.service.js';

@Injectable()
export class ChartService {
  constructor(private cache: LiveCandleCacheService) {}

  getCandles(symbol: string, range: ChartRange): Promise<PricePoint[]> {
    return this.cache.getCandles(symbol, range);
  }
}
