import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface PreviewPrice {
  symbol: string;
  raw: string;
  price: number | null;
  percentChange: number | null;
  ts: number;
}

export const PREVIEW_SYMBOLS: { raw: string; display: string }[] = [
  { raw: 'VOO',           display: 'VOO'     },
  { raw: 'AAPL',          display: 'AAPL'    },
  { raw: 'MSFT',          display: 'MSFT'    },
  { raw: 'OANDA:AUD_USD', display: 'AUD/USD' },
];

@Injectable()
export class PreviewCacheService {
  private prices: PreviewPrice[] = PREVIEW_SYMBOLS.map(s => ({
    symbol: s.display,
    raw: s.raw,
    price: null,
    percentChange: null,
    ts: 0,
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
