import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompanyMetrics,
  CompanyProfile,
  FinnhubMetric,
  FinnhubNewsItem,
  FinnhubProfile2,
} from './company.types.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);
  private profileCache = new Map<string, CacheEntry<CompanyProfile>>();
  private metricsCache = new Map<string, CacheEntry<CompanyMetrics>>();
  private newsCache = new Map<string, CacheEntry<FinnhubNewsItem[]>>();

  constructor(private config: ConfigService) {}

  private get apiKey(): string {
    return this.config.getOrThrow<string>('FINNHUB_API_KEY');
  }

  async getProfile(symbol: string): Promise<CompanyProfile> {
    const cached = this.profileCache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const url = `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new BadRequestException(`Finnhub profile request failed: ${res.status}`);

    const raw = (await res.json()) as FinnhubProfile2;
    if (!raw.name) {
      const empty: CompanyProfile = { name: '', ticker: symbol, marketCap: 0, logo: '', industry: '', currency: 'USD' };
      this.profileCache.set(symbol, { data: empty, expiresAt: Date.now() + TTL_MS });
      return empty;
    }

    const data: CompanyProfile = {
      name: raw.name,
      ticker: raw.ticker,
      marketCap: raw.marketCapitalization,
      logo: raw.logo,
      industry: raw.finnhubIndustry,
      currency: raw.currency ?? 'USD',
    };
    this.profileCache.set(symbol, { data, expiresAt: Date.now() + TTL_MS });
    this.logger.debug(`Profile fetched for ${symbol}`);
    return data;
  }

  async getMetrics(symbol: string): Promise<CompanyMetrics> {
    const cached = this.metricsCache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const url = `${FINNHUB_BASE}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new BadRequestException(`Finnhub metrics request failed: ${res.status}`);

    const raw = (await res.json()) as FinnhubMetric;
    const m = raw.metric ?? {};
    const data: CompanyMetrics = {
      pe: (m as Record<string, number | null>)['peBasicExclExtraTTM'] ?? null,
      weekHigh52: (m as Record<string, number>)['52WeekHigh'] ?? 0,
      weekLow52: (m as Record<string, number>)['52WeekLow'] ?? 0,
      dividendYield: (m as Record<string, number | null>)['dividendYieldIndicatedAnnual'] ?? null,
      beta: (m as Record<string, number | null>)['beta'] ?? null,
    };
    this.metricsCache.set(symbol, { data, expiresAt: Date.now() + TTL_MS });
    return data;
  }

  async getNews(symbol: string, count = 5): Promise<FinnhubNewsItem[]> {
    const cached = this.newsCache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new BadRequestException(`Finnhub news request failed: ${res.status}`);

    const raw = (await res.json()) as FinnhubNewsItem[];
    const data = Array.isArray(raw) ? raw.slice(0, count) : [];
    this.newsCache.set(symbol, { data, expiresAt: Date.now() + TTL_MS });
    return data;
  }
}
