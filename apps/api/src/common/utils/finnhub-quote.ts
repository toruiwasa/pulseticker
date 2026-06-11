const FINNHUB_BASE = 'https://finnhub.io/api/v1';

export interface FinnhubQuote {
  c: number;
  pc: number;
  t: number;
}

export async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<FinnhubQuote> {
  const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`);
  if (!res.ok) throw new Error(`Finnhub quote failed for ${symbol}: ${res.status}`);
  const { c, pc, t } = (await res.json()) as FinnhubQuote;
  return { c, pc, t };
}
