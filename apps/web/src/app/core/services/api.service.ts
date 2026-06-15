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

export type ChartRange = '1D' | '1Y';

export interface CompanyProfile {
  name: string;
  ticker: string;
  marketCap: number;
  logo: string;
  industry: string;
  currency: string;
}

export interface CompanyMetrics {
  pe: number | null;
  weekHigh52: number;
  weekLow52: number;
  dividendYield: number | null;
  beta: number | null;
}

export interface NewsItem {
  headline: string;
  url: string;
  datetime: number;
  source: string;
  summary: string;
}

export interface MarketStatus {
  isOpen: boolean;
  timestamp: string;
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

  getCandles(symbol: string, range: ChartRange = '1D') {
    return this.get<CandlePoint[]>(
      `/chart/candles?symbol=${encodeURIComponent(symbol)}&range=${range}`,
    );
  }

  getCompanyProfile(symbol: string) {
    return this.get<CompanyProfile>(`/company/profile?symbol=${encodeURIComponent(symbol)}`);
  }

  getCompanyMetrics(symbol: string) {
    return this.get<CompanyMetrics>(`/company/metrics?symbol=${encodeURIComponent(symbol)}`);
  }

  getCompanyNews(symbol: string) {
    return this.get<NewsItem[]>(`/company/news?symbol=${encodeURIComponent(symbol)}`);
  }

  getMarketStatus() {
    return this.get<MarketStatus>('/market/status');
  }
}
