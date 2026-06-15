import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, take, toArray } from 'rxjs';
import { PreviewController } from './preview.controller.js';
import { PreviewCacheService, PREVIEW_SYMBOLS } from './preview-cache.service.js';
import { LiveCandleCacheService } from '../chart/live-candle-cache.service.js';

const makeNullPrices = () =>
  PREVIEW_SYMBOLS.map(s => ({ symbol: s.display, raw: s.raw, price: null, percentChange: null, ts: 0 }));

const makePrices = (price: number) =>
  PREVIEW_SYMBOLS.map(s => ({ symbol: s.display, raw: s.raw, price, percentChange: 1, ts: 1000 }));

const STUB_CANDLES = [{ time: 1000, value: 180 }, { time: 1060, value: 182 }];

describe('PreviewController', () => {
  let controller: PreviewController;
  let cache: PreviewCacheService;
  let candleCache: { getCandles: jest.Mock };

  beforeEach(async () => {
    candleCache = { getCandles: jest.fn().mockResolvedValue(STUB_CANDLES) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreviewController],
      providers: [
        PreviewCacheService,
        { provide: LiveCandleCacheService, useValue: candleCache },
      ],
    }).compile();

    controller = module.get(PreviewController);
    cache = module.get(PreviewCacheService);
  });

  describe('GET /preview/prices', () => {
    it('returns prices and AAPL candles', async () => {
      const result = await controller.getPrices();
      expect(result.prices).toEqual(makeNullPrices());
      expect(result.candles).toEqual(STUB_CANDLES);
    });

    it('reflects cache updates', async () => {
      cache.setPrices(makePrices(100));
      const result = await controller.getPrices();
      expect(result.prices).toEqual(makePrices(100));
    });
  });

  describe('SSE /preview/prices/stream', () => {
    it('first message includes prices and AAPL candles', async () => {
      const stream$ = controller.stream();
      const first = await firstValueFrom(stream$);
      const data = (first as { data: unknown }).data as { prices: unknown; candles: unknown };
      expect(data.prices).toEqual(makeNullPrices());
      expect(data.candles).toEqual(STUB_CANDLES);
    });

    it('subsequent messages include prices with candles: null', async () => {
      const stream$ = controller.stream().pipe(take(2), toArray());
      const resultsPromise = firstValueFrom(stream$);

      // Emit the tick after getCandles resolves (one microtask tick)
      await Promise.resolve();
      cache.setPrices(makePrices(200));

      const results = await resultsPromise;
      expect(results).toHaveLength(2);
      const second = (results[1] as { data: unknown }).data as { prices: unknown; candles: unknown };
      expect(second.prices).toEqual(makePrices(200));
      expect(second.candles).toBeNull();
    });
  });
});
