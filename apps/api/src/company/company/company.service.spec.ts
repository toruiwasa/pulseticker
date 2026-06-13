import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { CompanyService } from './company.service';

const MOCK_PROFILE = {
  name: 'Apple Inc',
  ticker: 'AAPL',
  marketCapitalization: 3000000,
  logo: 'https://logo.example.com/aapl',
  finnhubIndustry: 'Technology',
  weburl: 'https://apple.com',
  country: 'US',
  currency: 'USD',
};

const MOCK_METRIC = {
  metric: {
    peBasicExclExtraTTM: 28.4,
    '52WeekHigh': 237.23,
    '52WeekLow': 164.08,
    dividendYieldIndicatedAnnual: 0.44,
    beta: 1.24,
  },
};

const MOCK_NEWS = [
  { headline: 'Apple beats earnings', url: 'https://news.example.com/1', datetime: 1700000000, source: 'Reuters', summary: '' },
  { headline: 'iPhone sales surge', url: 'https://news.example.com/2', datetime: 1700000001, source: 'Bloomberg', summary: '' },
];

describe('CompanyService', () => {
  let service: CompanyService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: ConfigService, useValue: { getOrThrow: () => 'test-api-key' } },
      ],
    }).compile();
    service = module.get(CompanyService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getProfile', () => {
    it('returns mapped profile', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_PROFILE,
      } as Response);

      const result = await service.getProfile('AAPL');
      expect(result).toEqual({
        name: 'Apple Inc',
        ticker: 'AAPL',
        marketCap: 3000000,
        logo: 'https://logo.example.com/aapl',
        industry: 'Technology',
      });
    });

    it('caches result so second call skips fetch', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => MOCK_PROFILE,
      } as Response);

      await service.getProfile('AAPL');
      await service.getProfile('AAPL');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns empty profile when Finnhub returns no name', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      const result = await service.getProfile('OANDA:AUD_USD');
      expect(result.name).toBe('');
    });

    it('throws BadRequestException on non-ok response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
      } as Response);

      await expect(service.getProfile('AAPL')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getMetrics', () => {
    it('maps Finnhub metric fields correctly', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_METRIC,
      } as Response);

      const result = await service.getMetrics('AAPL');
      expect(result.pe).toBeCloseTo(28.4);
      expect(result.weekHigh52).toBeCloseTo(237.23);
      expect(result.weekLow52).toBeCloseTo(164.08);
      expect(result.dividendYield).toBeCloseTo(0.44);
      expect(result.beta).toBeCloseTo(1.24);
    });

    it('handles null metric values', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ metric: {} }),
      } as Response);

      const result = await service.getMetrics('AAPL');
      expect(result.pe).toBeNull();
      expect(result.beta).toBeNull();
    });
  });

  describe('getNews', () => {
    it('returns at most 5 items and caches', async () => {
      const manyNews = Array.from({ length: 10 }, (_, i) => ({
        ...MOCK_NEWS[0],
        url: `https://news.example.com/${i}`,
      }));
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => manyNews,
      } as Response);

      const result = await service.getNews('AAPL');
      expect(result).toHaveLength(5);
    });

    it('returns empty array when API returns non-array', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => null,
      } as Response);

      const result = await service.getNews('AAPL');
      expect(result).toEqual([]);
    });
  });
});
