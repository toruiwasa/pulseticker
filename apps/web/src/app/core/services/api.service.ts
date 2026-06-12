import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface SymbolSearchResult {
  symbol: string;
  description: string;
}

export interface QuoteResponse {
  c: number;
  pc: number;
  t: number;
}

export interface CandlePoint {
  time: number;
  value: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;
  constructor(private http: HttpClient) {}
  get<T>(path: string) { return this.http.get<T>(`${this.base}${path}`); }
  post<T>(path: string, body: unknown) { return this.http.post<T>(`${this.base}${path}`, body); }
  delete<T>(path: string) { return this.http.delete<T>(`${this.base}${path}`); }

  searchSymbols(q: string) {
    return this.get<SymbolSearchResult[]>(`/watchlist/search?q=${encodeURIComponent(q)}`);
  }
  getQuote(symbol: string) {
    return this.get<QuoteResponse>(`/watchlist/quote?symbol=${encodeURIComponent(symbol)}`);
  }
  getCandles(symbol: string) {
    return this.get<CandlePoint[]>(`/chart/candles?symbol=${encodeURIComponent(symbol)}`);
  }
}
