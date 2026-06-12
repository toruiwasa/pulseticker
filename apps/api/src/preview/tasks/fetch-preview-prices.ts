import { ConfigService } from '@nestjs/config';
import { JobHelpers } from 'graphile-worker';
import { fetchFinnhubQuote, FinnhubQuote } from '../../common/utils/finnhub-quote';
import { fetchTwelveDataQuote } from '../../common/utils/twelve-data-quote';
import { toTwelveDataSymbol } from '../../chart/twelve-data-symbol';
import { PreviewCacheService, PreviewPrice, PREVIEW_SYMBOLS } from '../preview-cache.service';

const FOREX_TTL_MS = 300_000;
const forexCache = new Map<string, { quote: FinnhubQuote; fetchedAt: number }>();

function isForex(rawSymbol: string): boolean {
  return rawSymbol.startsWith('OANDA:');
}

async function fetchQuote(
  rawSymbol: string,
  finnhubKey: string,
  twelveKey: string,
  now: number,
): Promise<FinnhubQuote> {
  if (!isForex(rawSymbol)) {
    return fetchFinnhubQuote(rawSymbol, finnhubKey);
  }
  const cached = forexCache.get(rawSymbol);
  if (cached && now - cached.fetchedAt < FOREX_TTL_MS) {
    return cached.quote;
  }
  const quote = await fetchTwelveDataQuote(toTwelveDataSymbol(rawSymbol), twelveKey);
  forexCache.set(rawSymbol, { quote, fetchedAt: now });
  return quote;
}

export function makeFetchPreviewPricesTask(config: ConfigService, cache: PreviewCacheService) {
  return async (_payload: unknown, helpers: JobHelpers): Promise<void> => {
    const finnhubKey = config.getOrThrow<string>('FINNHUB_API_KEY');
    const twelveKey = config.getOrThrow<string>('TWELVEDATA_API_KEY');
    const now = Date.now();

    const results = await Promise.allSettled(
      PREVIEW_SYMBOLS.map(s => fetchQuote(s.raw, finnhubKey, twelveKey, now)),
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

// Exported for tests only — lets the spec reset the in-task cache between cases.
export function __resetForexCacheForTests() {
  forexCache.clear();
}
