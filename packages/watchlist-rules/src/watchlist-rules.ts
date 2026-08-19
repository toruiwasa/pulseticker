/**
 * Watchlist business rules, as pure functions.
 *
 * These were previously expressed as Supabase call sequences inside
 * WatchlistService, which meant verifying "a new user is seeded once" required
 * reproducing a from().select().eq().maybeSingle() chain. The rules are here so
 * they can be read and tested without a framework or a database — and so the
 * web and mobile clients stop restating them as magic numbers.
 */

/** Symbols a user's watchlist is seeded with on first sign-in (REQ-01). */
export const DEFAULT_SYMBOLS = [
  'VOO',
  'AAPL',
  'MSFT',
  'OANDA:AUD_USD',
  'OANDA:AUD_JPY',
] as const;

/**
 * Maximum symbols per watchlist.
 *
 * Distinct from the Finnhub 50-symbol *subscription* cap, which is a
 * process-wide limit across all users — see MAX_LIVE_SUBSCRIPTIONS. The two
 * happen to share a value today and must not be collapsed into one constant.
 */
export const MAX_WATCHLIST_SIZE = 50;

/**
 * A user is seeded exactly once, and the marker is the existence of a profile
 * row — not whether the watchlist is currently empty. A user who deletes every
 * symbol has made a choice, and re-seeding would silently undo it.
 */
export function needsSeeding(input: { hasProfile: boolean }): boolean {
  return !input.hasProfile;
}

/** Whether another symbol may be added to a watchlist of the given size. */
export function canAdd(input: { count: number }): boolean {
  return input.count < MAX_WATCHLIST_SIZE;
}

/** Symbols are stored and compared uppercased, so 'aapl' and 'AAPL' are one symbol. */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}
