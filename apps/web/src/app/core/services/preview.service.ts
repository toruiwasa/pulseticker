import { Injectable } from '@angular/core';
import { EMPTY, Observable, fromEvent } from 'rxjs';
import { map, retry, startWith, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CandlePoint } from './api.service';

export interface PreviewPrice {
  symbol: string;
  raw: string;
  price: number | null;
  percentChange: number | null;
  ts: number;
}

export interface PreviewSnapshot {
  prices:  PreviewPrice[];
  candles: CandlePoint[] | null;
}

export const PREVIEW_SYMBOLS_INITIAL: PreviewPrice[] = [
  { symbol: 'VOO',     raw: 'VOO',           price: null, percentChange: null, ts: 0 },
  { symbol: 'AAPL',    raw: 'AAPL',          price: null, percentChange: null, ts: 0 },
  { symbol: 'MSFT',    raw: 'MSFT',          price: null, percentChange: null, ts: 0 },
  { symbol: 'AUD/USD', raw: 'OANDA:AUD_USD', price: null, percentChange: null, ts: 0 },
];

@Injectable({ providedIn: 'root' })
export class PreviewService {
  getPriceStream(): Observable<PreviewSnapshot> {
    const visibility$ = fromEvent(document, 'visibilitychange').pipe(
      map(() => !document.hidden),
      startWith(!document.hidden),
    );

    return visibility$.pipe(
      switchMap(isVisible => (isVisible ? this.connectSse() : EMPTY)),
    );
  }

  private connectSse(): Observable<PreviewSnapshot> {
    return new Observable<PreviewSnapshot>(subscriber => {
      const es = new EventSource(`${environment.apiUrl}/preview/prices/stream`);
      es.onmessage = (e: MessageEvent) => {
        try {
          subscriber.next(JSON.parse(e.data) as PreviewSnapshot);
        } catch {
          // malformed data — skip
        }
      };
      es.onerror = () => subscriber.error(new Error('SSE error'));
      return () => es.close();
    }).pipe(
      retry({ delay: 5000 }),
    );
  }
}
