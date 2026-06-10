jest.mock('../../auth/supabase-auth.guard', () => ({ SupabaseAuthGuard: class {} }));

import { BadRequestException } from '@nestjs/common';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';
import type { AuthedRequest } from '../../common/types/authed-request';

function authedReq(userId = 'u1'): AuthedRequest {
  return { user: { userId, email: 'x@y.com' } } as AuthedRequest;
}

describe('WatchlistController', () => {
  let controller: WatchlistController;
  let service: jest.Mocked<WatchlistService>;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      searchSymbols: jest.fn(),
      getQuote: jest.fn(),
    } as unknown as jest.Mocked<WatchlistService>;
    controller = new WatchlistController(service);
  });

  describe('GET /watchlist/search', () => {
    it('delegates to searchSymbols with trimmed query', () => {
      service.searchSymbols.mockResolvedValue([{ symbol: 'AAPL', description: 'Apple' }]);
      controller.search('  apple  ');
      expect(service.searchSymbols).toHaveBeenCalledWith('apple');
    });

    it('throws BadRequestException when q is missing', () => {
      expect(() => controller.search('')).toThrow(BadRequestException);
      expect(() => controller.search('   ')).toThrow(BadRequestException);
      expect(() => controller.search(undefined as unknown as string)).toThrow(BadRequestException);
    });
  });

  describe('GET /watchlist/quote', () => {
    it('delegates to getQuote with trimmed symbol', () => {
      service.getQuote.mockResolvedValue({ c: 150, pc: 149, t: 1700000000 });
      controller.quote('  AAPL  ');
      expect(service.getQuote).toHaveBeenCalledWith('AAPL');
    });

    it('throws BadRequestException when symbol is missing', () => {
      expect(() => controller.quote('')).toThrow(BadRequestException);
      expect(() => controller.quote('   ')).toThrow(BadRequestException);
    });
  });

  describe('GET /watchlist', () => {
    it('delegates to findAll with userId from request', () => {
      controller.getAll(authedReq('u42'));
      expect(service.findAll).toHaveBeenCalledWith('u42');
    });
  });

  describe('POST /watchlist', () => {
    it('delegates to create with userId and symbol', () => {
      controller.create(authedReq('u42'), { symbol: 'AAPL' });
      expect(service.create).toHaveBeenCalledWith('u42', 'AAPL');
    });
  });

  describe('DELETE /watchlist/:symbol', () => {
    it('delegates to remove with userId and symbol param', () => {
      controller.remove(authedReq('u42'), 'AAPL');
      expect(service.remove).toHaveBeenCalledWith('u42', 'AAPL');
    });
  });
});
