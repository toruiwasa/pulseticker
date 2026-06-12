const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

export interface TwelveDataQuote {
  c: number;
  pc: number;
  t: number;
}

interface TwelveDataQuoteResponse {
  close?: string;
  previous_close?: string;
  timestamp?: number | string;
  status?: string;
  code?: number;
  message?: string;
}

/**
 * Fetches a current quote from Twelve Data. The symbol must be in Twelve
 * Data form (e.g. `AUD/USD`, not `OANDA:AUD_USD`); callers translate via
 * `toTwelveDataSymbol`.
 *
 * Returns a `{ c, pc, t }` shape identical to `fetchFinnhubQuote` so the
 * preview task can dispatch by symbol family without diverging downstream.
 *
 * Throws on non-200 or when the body reports `status === 'error'`.
 */
export async function fetchTwelveDataQuote(
  symbol: string,
  apiKey: string,
): Promise<TwelveDataQuote> {
  const url =
    `${TWELVE_DATA_BASE}/quote` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Twelve Data quote failed for ${symbol}: ${res.status}`);
  }
  const body = (await res.json()) as TwelveDataQuoteResponse;
  if (body.status === 'error') {
    throw new Error(`Twelve Data quote error for ${symbol}: ${body.message ?? 'unknown'}`);
  }
  const c = parseFloat(body.close ?? '');
  const pc = parseFloat(body.previous_close ?? '');
  if (!Number.isFinite(c) || !Number.isFinite(pc)) {
    throw new Error(`Twelve Data quote unparseable for ${symbol}`);
  }
  const t =
    typeof body.timestamp === 'number'
      ? body.timestamp
      : typeof body.timestamp === 'string'
        ? parseInt(body.timestamp, 10) || Math.floor(Date.now() / 1000)
        : Math.floor(Date.now() / 1000);
  return { c, pc, t };
}
