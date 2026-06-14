import { Injectable } from '@nestjs/common';
import { SecureLogger } from '../common/logger/secure-logger';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { CandlePoint, ChartRange } from './chart.types';
import { toTwelveDataSymbol } from './twelve-data-symbol';

interface TwelveDataValue {
  datetime: string;
  close: string;
}

interface TwelveDataResponse {
  values?: TwelveDataValue[];
  status?: string;
  code?: number;
  message?: string;
}

interface RangeConfig {
  interval: string;
  outputsize: number;
  format: string;
}

const RANGE_CONFIG: Record<ChartRange, RangeConfig> = {
  '1D': { interval: '1min', outputsize: 390, format: 'yyyy-MM-dd HH:mm:ss' },
  '1Y': { interval: '1day', outputsize: 253, format: 'yyyy-MM-dd' },
};

@Injectable()
export class TwelveDataService {
  private readonly logger = new SecureLogger(TwelveDataService.name);
  private readonly base = 'https://api.twelvedata.com';

  constructor(private config: ConfigService) {}

  async getTimeSeries(symbol: string, range: ChartRange): Promise<CandlePoint[]> {
    const cfg = RANGE_CONFIG[range];
    if (!cfg) return [];

    const apiKey = this.config.getOrThrow<string>('TWELVEDATA_API_KEY');
    const tdSymbol = toTwelveDataSymbol(symbol);
    const url =
      `${this.base}/time_series` +
      `?symbol=${encodeURIComponent(tdSymbol)}` +
      `&interval=${cfg.interval}` +
      `&outputsize=${cfg.outputsize}` +
      `&timezone=${encodeURIComponent('America/New_York')}` +
      `&apikey=${apiKey}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Twelve Data ${symbol} ${range} HTTP ${res.status}`);
        return [];
      }
      const body = (await res.json()) as TwelveDataResponse;
      if (body.status === 'error' || !body.values) {
        this.logger.warn(`Twelve Data ${symbol} ${range} error: ${body.message ?? 'no values'}`);
        return [];
      }
      return body.values
        .map(v => ({
          time: DateTime.fromFormat(v.datetime, cfg.format, { zone: 'America/New_York' }).toUnixInteger(),
          value: parseFloat(v.close),
        }))
        .filter(p => Number.isFinite(p.time) && Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time);
    } catch (err) {
      this.logger.warn(`Twelve Data fetch failed for ${symbol}: ${(err as Error).message}`);
      return [];
    }
  }
}
