import { z } from 'zod';

/**
 * One point on a price-over-time chart: GET /chart/:symbol returns PricePoint[].
 *
 * Formerly `CandlePoint`, declared independently in apps/api and apps/web —
 * but it carries a single value, no OHLC, so the old name promised candle data
 * no consumer could get, and the duplication was the drift the schemas package
 * exists to prevent (#70).
 *
 * Wire format: the JSON field names `time` and `value` are the API contract
 * (and what lightweight-charts consumes) — renaming the type must not touch them.
 */
export const PricePointSchema = z.object({
  /** Unix seconds, aligned to the source bucket (1-min for 1D, 1-day for 1Y). */
  time: z.number(),
  value: z.number(),
});

export type PricePoint = z.infer<typeof PricePointSchema>;
