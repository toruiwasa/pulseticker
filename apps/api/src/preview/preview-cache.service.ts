import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface PreviewPrice {
  symbol: string;
  raw: string;
  price: number | null;
  percentChange: number | null;
  ts: number;
  currency: string;
}

export const PREVIEW_SYMBOLS: { raw: string; display: string; currency: string }[] = [
  { raw: 'VOO',           display: 'VOO',     currency: 'USD' },
  { raw: 'AAPL',          display: 'AAPL',    currency: 'USD' },
  { raw: 'MSFT',          display: 'MSFT',    currency: 'USD' },
  { raw: 'OANDA:AUD_USD', display: 'AUD/USD', currency: 'USD' },
];

@Injectable()
export class PreviewCacheService {
  private prices: PreviewPrice[] = PREVIEW_SYMBOLS.map(s => ({
    symbol: s.display,
    raw: s.raw,
    price: null,
    percentChange: null,
    ts: 0,
    currency: s.currency,
  }));

  readonly prices$ = new Subject<PreviewPrice[]>();

  getPrices(): PreviewPrice[] {
    return this.prices;
  }

  setPrices(updated: PreviewPrice[]): void {
    this.prices = updated;
    this.prices$.next(this.prices);
  }
}
