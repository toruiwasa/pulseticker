import { PriceCacheService } from './price-cache.service.js';

describe('PriceCacheService', () => {
  describe('handlePriceReceived()', () => {
    it('populates the price cache on each trade', () => {
      const service = new PriceCacheService();

      service.handlePriceReceived({ symbol: 'AAPL', price: 185.5, ts: 1000 });

      expect(service.getLastKnownPrices(['AAPL'])).toEqual([
        { symbol: 'AAPL', price: 185.5, ts: 1000 },
      ]);
    });

    it('normalises the symbol to uppercase when caching', () => {
      const service = new PriceCacheService();

      service.handlePriceReceived({ symbol: 'tsla', price: 250.0, ts: 2000 });

      expect(service.getLastKnownPrices(['TSLA'])).toEqual([
        { symbol: 'TSLA', price: 250.0, ts: 2000 },
      ]);
    });
  });

  describe('getLastKnownPrices()', () => {
    it('returns null price and ts for an unseen symbol', () => {
      const service = new PriceCacheService();
      expect(service.getLastKnownPrices(['AAPL'])).toEqual([
        { symbol: 'AAPL', price: null, ts: null },
      ]);
    });

    it('normalises the query symbol to uppercase in the returned array', () => {
      const service = new PriceCacheService();
      service.handlePriceReceived({ symbol: 'MSFT', price: 300.0, ts: 3000 });

      const result = service.getLastKnownPrices(['msft']);
      expect(result[0].symbol).toBe('MSFT');
      expect(result[0].price).toBe(300.0);
    });
  });
});
