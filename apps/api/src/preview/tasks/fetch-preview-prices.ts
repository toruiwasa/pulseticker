import { ConfigService } from '@nestjs/config';
import { JobHelpers } from 'graphile-worker';
import { fetchFinnhubQuote } from '../../common/utils/finnhub-quote';
import { PreviewCacheService, PreviewPrice, PREVIEW_SYMBOLS } from '../preview-cache.service';

export function makeFetchPreviewPricesTask(config: ConfigService, cache: PreviewCacheService) {
  return async (_payload: unknown, helpers: JobHelpers): Promise<void> => {
    const apiKey = config.getOrThrow<string>('FINNHUB_API_KEY');
    const results = await Promise.allSettled(
      PREVIEW_SYMBOLS.map(s => fetchFinnhubQuote(s.raw, apiKey)),
    );

    const prices: PreviewPrice[] = PREVIEW_SYMBOLS.map((s, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') {
        const pct = r.value.pc !== 0
          ? ((r.value.c - r.value.pc) / r.value.pc) * 100
          : 0;
        return { symbol: s.display, raw: s.raw, price: r.value.c, percentChange: pct, ts: Date.now() };
      }
      return { symbol: s.display, raw: s.raw, price: null, percentChange: null, ts: Date.now() };
    });

    cache.setPrices(prices);

    await helpers.addJob('fetch-preview-prices', {}, {
      runAt: new Date(Date.now() + 10_000),
      jobKey: 'preview-fetch',
      jobKeyMode: 'replace',
    });
  };
}
