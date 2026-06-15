import { DateTime } from 'luxon';
import { US_MARKET_HOLIDAYS } from './holidays.js';

const ET_ZONE = 'America/New_York';

export function isWeekendOrHoliday(dt: DateTime): boolean {
  const weekday = dt.weekday; // 1 = Mon, 7 = Sun
  if (weekday === 6 || weekday === 7) return true;
  const dateStr = dt.toFormat('yyyy-MM-dd');
  return US_MARKET_HOLIDAYS.includes(dateStr);
}

/**
 * Returns the Unix seconds timestamp of 09:30 America/New_York
 * on the most recent trading day (today if it is a trading day,
 * otherwise walks back over weekends and US market holidays).
 */
export function getLastTradingDayOpenUnix(now: Date = new Date()): number {
  let candidate = DateTime.fromJSDate(now).setZone(ET_ZONE).startOf('day');
  while (isWeekendOrHoliday(candidate)) {
    candidate = candidate.minus({ days: 1 });
  }
  return candidate.set({ hour: 9, minute: 30, second: 0, millisecond: 0 }).toUnixInteger();
}
