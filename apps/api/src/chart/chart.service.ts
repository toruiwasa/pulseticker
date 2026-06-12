import { Injectable, Logger } from '@nestjs/common';
import { getLastTradingDayOpenUnix } from '@pulseticker/trading-utils';
import { FinnhubService } from '../finnhub/finnhub/finnhub.service';

export interface CandlePoint {
  time: number;
  value: number;
}

@Injectable()
export class ChartService {
  private readonly logger = new Logger(ChartService.name);

  constructor(private finnhub: FinnhubService) {}

  async getCandles(symbol: string): Promise<CandlePoint[]> {
    const from = getLastTradingDayOpenUnix();
    const to = Math.floor(Date.now() / 1000);

    try {
      const candles = await this.finnhub.getCandles(symbol, '1', from, to);
      if (candles.s !== 'ok' || !candles.t || !candles.c) return [];
      return candles.t.map((time, i) => ({ time, value: candles.c![i] }));
    } catch (err) {
      this.logger.warn(`Failed to fetch candles for ${symbol}: ${(err as Error).message}`);
      return [];
    }
  }
}
