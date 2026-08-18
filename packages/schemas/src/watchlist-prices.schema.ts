import { z } from 'zod';

/**
 * One row of `GET /watchlist/prices` (Task 5 / Issue #8 — not implemented yet).
 *
 * `id` is `watchlist_items.id`; `price` and `ts` come from
 * `FinnhubService.getLastKnownPrices()`, which returns null for both when the
 * symbol is not in the in-memory cache. There is deliberately no Finnhub REST
 * fallback on a cache miss (REQ-17), so nulls are an expected steady state
 * after a Render cold start — not an error.
 */
export const WatchlistPriceItemSchema = z.object({
  id:     z.uuid(),
  symbol: z.string(),
  price:  z.number().nullable(),
  ts:     z.number().nullable(),  // epoch ms — Finnhub trade `t`, null if uncached
});

export const WatchlistPricesResponseSchema = z.object({
  cached: z.boolean(),  // false = price cache empty (cold start); every item's price is null
  items:  z.array(WatchlistPriceItemSchema),
});

export type WatchlistPriceItem     = z.infer<typeof WatchlistPriceItemSchema>;
export type WatchlistPricesResponse = z.infer<typeof WatchlistPricesResponseSchema>;
