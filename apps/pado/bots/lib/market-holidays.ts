/**
 * Stock market trading calendar.
 *
 * Static holiday tables for NYSE (US) and KRX (South Korea), 2026-2027.
 * Used by:
 *   - create-finance-markets.ts: shifts intended close_time to next trading day
 *   - prediction-keeper.ts (indirect): markets created via the script always
 *     have close_time on a real trading day, so candle-stale errors are limited
 *     to actual upstream failures rather than calendar mistakes.
 *
 * Pure module; no I/O. Re-evaluate the static table each year.
 */

export type Market = 'NYSE' | 'KRX';

// YYYY-MM-DD strings in the exchange's local calendar. NYSE local = US Eastern,
// KRX local = Asia/Seoul. We only compare dates, so timezone of the date label
// matches the exchange's view of "today". Each session's UTC close timestamp is
// computed separately by sessionCloseUtc().
const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed; July 4 = Saturday)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
  // 2027
  '2027-01-01',
  '2027-01-18',
  '2027-02-15',
  '2027-03-26', // Good Friday
  '2027-05-31',
  '2027-06-18', // Juneteenth observed (June 19 = Saturday)
  '2027-07-05', // Independence Day observed (July 4 = Sunday)
  '2027-09-06',
  '2027-11-25',
  '2027-12-24', // Christmas observed (Dec 25 = Saturday)
]);

const KRX_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  '2026-01-01', // New Year
  '2026-02-16', // Lunar New Year (Mon)
  '2026-02-17', // Lunar New Year holiday
  '2026-02-18', // Lunar New Year holiday
  '2026-03-02', // Independence Movement Day (observed; Mar 1 = Sunday)
  '2026-05-05', // Children's Day
  '2026-05-25', // Buddha's Birthday (observed)
  '2026-06-03', // Local elections
  '2026-06-06', // Memorial Day (Saturday — KRX observes weekday holidays only;
                // included for safety since some sources list it)
  '2026-08-17', // Liberation Day (observed; Aug 15 = Saturday)
  '2026-09-24', // Chuseok eve
  '2026-09-25', // Chuseok
  '2026-09-26', // Chuseok day after
  '2026-10-05', // National Foundation (observed; Oct 3 = Saturday)
  '2026-10-09', // Hangul Day
  '2026-12-25', // Christmas
  '2026-12-31', // Year-end closure (KRX last business day)
  // 2027
  '2027-01-01',
  '2027-02-08', // Lunar New Year holidays
  '2027-02-09',
  '2027-03-01',
  '2027-05-05',
  '2027-05-13', // Buddha's Birthday
  '2027-08-16', // Liberation Day observed
  '2027-09-14', // Chuseok eve
  '2027-09-15',
  '2027-09-16',
  '2027-10-04', // National Foundation observed
  '2027-10-11', // Hangul Day observed
  '2027-12-31',
]);

function holidaySet(market: Market): ReadonlySet<string> {
  return market === 'NYSE' ? NYSE_HOLIDAYS : KRX_HOLIDAYS;
}

/**
 * Format a Date as YYYY-MM-DD in the exchange's local timezone.
 * NYSE = America/New_York, KRX = Asia/Seoul.
 *
 * Uses Intl.DateTimeFormat (en-CA produces ISO date format).
 */
export function localDateString(market: Market, d: Date): string {
  const tz = market === 'NYSE' ? 'America/New_York' : 'Asia/Seoul';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Day-of-week in the exchange's local timezone (0 = Sunday, 6 = Saturday).
 */
function localWeekday(market: Market, d: Date): number {
  const tz = market === 'NYSE' ? 'America/New_York' : 'Asia/Seoul';
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

/**
 * True if the given instant falls on a trading day for the given market.
 * Trading day = weekday AND not in the static holiday list.
 */
export function isTradingDay(market: Market, d: Date): boolean {
  const wd = localWeekday(market, d);
  if (wd === 0 || wd === 6) return false;
  return !holidaySet(market).has(localDateString(market, d));
}

/**
 * Return the next trading day at or after the given instant.
 * Walks forward day by day in the exchange's local calendar until a trading
 * day is found. Capped at 30 iterations as a safety net (no holiday set should
 * ever block more than 5 consecutive days).
 */
export function nextTradingDay(market: Market, d: Date): Date {
  const cursor = new Date(d.getTime());
  for (let i = 0; i < 30; i++) {
    if (isTradingDay(market, cursor)) return cursor;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  throw new Error(`No trading day found within 30 days of ${d.toISOString()} for ${market}`);
}

/**
 * UTC milliseconds for the given session's regular-hours close.
 * Computed from the exchange's local close hour, then converted to UTC using
 * Intl with the appropriate timezone (handles DST automatically).
 *
 *   NYSE: 16:00 America/New_York
 *   KRX:  15:30 Asia/Seoul
 *
 * `d` only contributes the date (year-month-day); time-of-day is replaced by
 * the local close. Returns the UTC timestamp at that moment.
 */
export function sessionCloseUtc(market: Market, d: Date): number {
  const dateStr = localDateString(market, d); // YYYY-MM-DD in local tz
  const [y, m, day] = dateStr.split('-').map(Number);
  const tz = market === 'NYSE' ? 'America/New_York' : 'Asia/Seoul';
  const hour = market === 'NYSE' ? 16 : 15;
  const minute = market === 'NYSE' ? 0 : 30;
  return zonedDateToUtcMs(y, m, day, hour, minute, tz);
}

/**
 * Convert (Y, M, D, h, m) interpreted in the given timezone to a UTC ms timestamp.
 *
 * Iteratively corrects offset to handle DST. Two iterations are always enough
 * because IANA timezones have at most ±1h shifts.
 */
function zonedDateToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 2; i++) {
    const offsetMs = tzOffsetMs(new Date(utcMs), timeZone);
    utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMs;
  }
  return utcMs;
}

function tzOffsetMs(d: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;
  const localUtcMs = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour) === 24 ? 0 : Number(lookup.hour),
    Number(lookup.minute),
    Number(lookup.second),
  );
  return localUtcMs - d.getTime();
}
