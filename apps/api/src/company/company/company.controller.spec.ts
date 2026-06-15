jest.mock('../../auth/supabase-auth.guard', () => ({ SupabaseAuthGuard: class {} }));

import { BadRequestException } from '@nestjs/common';
import { CompanyController } from './company.controller.js';
import { CompanyService } from './company.service.js';

const MOCK_PROFILE = { name: 'Apple Inc', ticker: 'AAPL', marketCap: 3000000, logo: '', industry: 'Technology' };
const MOCK_METRICS = { pe: 28.4, weekHigh52: 237.23, weekLow52: 164.08, dividendYield: 0.44, beta: 1.24 };
const MOCK_NEWS = [{ headline: 'Test', url: 'https://example.com', datetime: 1700000000, source: 'Reuters', summary: '' }];

describe('CompanyController', () => {
  let controller: CompanyController;
  let service: jest.Mocked<Pick<CompanyService, 'getProfile' | 'getMetrics' | 'getNews'>>;

  beforeEach(() => {
    service = {
      getProfile: jest.fn().mockResolvedValue(MOCK_PROFILE),
      getMetrics: jest.fn().mockResolvedValue(MOCK_METRICS),
      getNews: jest.fn().mockResolvedValue(MOCK_NEWS),
    };
    controller = new CompanyController(service as unknown as CompanyService);
  });

  describe('profile', () => {
    it('calls service with trimmed symbol and returns result', async () => {
      const result = await controller.profile('  AAPL  ');
      expect(service.getProfile).toHaveBeenCalledWith('AAPL');
      expect(result).toBe(MOCK_PROFILE);
    });

    it('throws 400 when symbol is empty', () => {
      expect(() => controller.profile('')).toThrow(BadRequestException);
    });

    it('throws 400 when symbol is whitespace only', () => {
      expect(() => controller.profile('   ')).toThrow(BadRequestException);
    });
  });

  describe('metrics', () => {
    it('calls service with trimmed symbol and returns result', async () => {
      const result = await controller.metrics('AAPL');
      expect(service.getMetrics).toHaveBeenCalledWith('AAPL');
      expect(result).toBe(MOCK_METRICS);
    });

    it('throws 400 when symbol is empty', () => {
      expect(() => controller.metrics('')).toThrow(BadRequestException);
    });
  });

  describe('news', () => {
    it('calls service with trimmed symbol and returns result', async () => {
      const result = await controller.news('AAPL');
      expect(service.getNews).toHaveBeenCalledWith('AAPL');
      expect(result).toBe(MOCK_NEWS);
    });

    it('throws 400 when symbol is empty', () => {
      expect(() => controller.news('')).toThrow(BadRequestException);
    });
  });
});
