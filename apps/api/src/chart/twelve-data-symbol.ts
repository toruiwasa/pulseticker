/**
 * Maps an internal Finnhub-style symbol to the form Twelve Data expects.
 * The cache and WebSocket subscriptions all use the Finnhub form; only
 * outbound HTTP calls to Twelve Data go through this helper.
 */
export function toTwelveDataSymbol(finnhubSymbol: string): string {
  if (finnhubSymbol.startsWith('OANDA:')) {
    const pair = finnhubSymbol.slice('OANDA:'.length);
    return pair.replace('_', '/');
  }
  return finnhubSymbol;
}
