/**
 * Price staleness thresholds (REQ-17 watchlist states 5 and 6).
 *
 * Measured against the `fetchedAt` the query function records, not
 * `dataUpdatedAt`: after an MMKV rehydration the cache carries the age it had
 * when it was written, which is exactly what the banners must reflect.
 */
export const STALE_WARNING_MS = 60_000; // 60s  → amber "Updated N min ago"
export const STALE_DISCONNECTED_MS = 300_000; // 5min → red "Prices may be outdated." + Retry
