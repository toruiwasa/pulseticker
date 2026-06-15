import { PreviewCacheService, PREVIEW_SYMBOLS } from './preview-cache.service.js';

describe('PreviewCacheService', () => {
  let service: PreviewCacheService;

  beforeEach(() => {
    service = new PreviewCacheService();
  });

  it('initialises with 4 null-price entries matching PREVIEW_SYMBOLS', () => {
    const prices = service.getPrices();
    expect(prices).toHaveLength(4);
    prices.forEach((p, i) => {
      expect(p.symbol).toBe(PREVIEW_SYMBOLS[i].display);
      expect(p.raw).toBe(PREVIEW_SYMBOLS[i].raw);
      expect(p.currency).toBe(PREVIEW_SYMBOLS[i].currency);
      expect(p.price).toBeNull();
      expect(p.percentChange).toBeNull();
      expect(p.ts).toBe(0);
    });
  });

  it('setPrices updates the stored prices', () => {
    const updated = PREVIEW_SYMBOLS.map(s => ({
      symbol: s.display, raw: s.raw, currency: s.currency, price: 100, percentChange: 1.5, ts: 1000,
    }));
    service.setPrices(updated);
    expect(service.getPrices()).toEqual(updated);
  });

  it('setPrices emits updated prices on prices$', done => {
    const updated = PREVIEW_SYMBOLS.map(s => ({
      symbol: s.display, raw: s.raw, currency: s.currency, price: 200, percentChange: -0.5, ts: 2000,
    }));
    service.prices$.subscribe(emitted => {
      expect(emitted).toEqual(updated);
      done();
    });
    service.setPrices(updated);
  });

  it('getPrices returns the same reference after setPrices', () => {
    const updated = PREVIEW_SYMBOLS.map(s => ({
      symbol: s.display, raw: s.raw, currency: s.currency, price: 50, percentChange: 0, ts: 3000,
    }));
    service.setPrices(updated);
    expect(service.getPrices()).toBe(updated);
  });

  it('prices$ does not emit on construction', done => {
    let emitted = false;
    service.prices$.subscribe(() => { emitted = true; });
    setTimeout(() => {
      expect(emitted).toBe(false);
      done();
    }, 10);
  });
});
