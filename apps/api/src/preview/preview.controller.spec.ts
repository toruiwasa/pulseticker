import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, take, toArray } from 'rxjs';
import { PreviewController } from './preview.controller';
import { PreviewCacheService, PREVIEW_SYMBOLS } from './preview-cache.service';

const makeNullPrices = () =>
  PREVIEW_SYMBOLS.map(s => ({ symbol: s.display, raw: s.raw, price: null, percentChange: null, ts: 0 }));

const makePrices = (price: number) =>
  PREVIEW_SYMBOLS.map(s => ({ symbol: s.display, raw: s.raw, price, percentChange: 1, ts: 1000 }));

describe('PreviewController', () => {
  let controller: PreviewController;
  let cache: PreviewCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreviewController],
      providers: [PreviewCacheService],
    }).compile();

    controller = module.get(PreviewController);
    cache = module.get(PreviewCacheService);
  });

  describe('GET /preview/prices', () => {
    it('returns the current cached prices', () => {
      expect(controller.getPrices()).toEqual(makeNullPrices());
    });

    it('reflects cache updates', () => {
      cache.setPrices(makePrices(100));
      expect(controller.getPrices()).toEqual(makePrices(100));
    });
  });

  describe('SSE /preview/prices/stream', () => {
    it('emits the current prices immediately on subscription', async () => {
      const stream$ = controller.stream();
      const first = await firstValueFrom(stream$);
      expect((first as { data: unknown }).data).toEqual(makeNullPrices());
    });

    it('emits a second event when cache is updated', async () => {
      const stream$ = controller.stream().pipe(take(2), toArray());
      const resultsPromise = firstValueFrom(stream$);

      cache.setPrices(makePrices(200));

      const results = await resultsPromise;
      expect(results).toHaveLength(2);
      expect((results[1] as { data: unknown }).data).toEqual(makePrices(200));
    });
  });
});
