export const US_MARKET_HOLIDAYS: string[] = [
  // 2026
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',

  // 2027
  '2027-01-01',
  '2027-01-18',
  '2027-02-15',
  '2027-03-26',
  '2027-05-31',
  '2027-06-18',
  '2027-07-05',
  '2027-09-06',
  '2027-11-25',
  '2027-12-24',

  // 2028
  '2028-01-17',
  '2028-02-21',
  '2028-04-14',
  '2028-05-29',
  '2028-06-19',
  '2028-07-04',
  '2028-09-04',
  '2028-11-23',
  '2028-12-25',

  // 2029
  '2029-01-01',
  '2029-01-15',
  '2029-02-19',
  '2029-03-30',
  '2029-05-28',
  '2029-06-19',
  '2029-07-04',
  '2029-09-03',
  '2029-11-22',
  '2029-12-25',

  // 2030
  '2030-01-01',
  '2030-01-21',
  '2030-02-18',
  '2030-04-19',
  '2030-05-27',
  '2030-06-19',
  '2030-07-04',
  '2030-09-02',
  '2030-11-28',
  '2030-12-25',
];

export function isMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;

  if (weekday === 'Sat' || weekday === 'Sun') return false;
  if (US_MARKET_HOLIDAYS.includes(dateStr)) return false;
  const afterOpen = hour > 9 || (hour === 9 && minute >= 30);
  const beforeClose = hour < 16;
  return afterOpen && beforeClose;
}
