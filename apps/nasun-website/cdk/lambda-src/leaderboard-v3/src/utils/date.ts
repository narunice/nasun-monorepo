/**
 * Shared date utility functions for Leaderboard V3 Lambda handlers.
 * All functions use KST (UTC+9) for consistency with snapshot generation.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Get today's date string in YYYY-MM-DD format (KST).
 */
export function getTodayDateString(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.toISOString().split('T')[0];
}

/**
 * Get yesterday's date string in YYYY-MM-DD format.
 * If todayDate is provided, calculates relative to that date.
 * Otherwise uses current KST date.
 */
export function getYesterdayDateString(todayDate?: string): string {
  if (todayDate) {
    const date = new Date(todayDate);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  }
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  kst.setDate(kst.getDate() - 1);
  return kst.toISOString().split('T')[0];
}

/**
 * Get a date string N days ago in YYYY-MM-DD format (KST).
 */
export function getDateNDaysAgo(days: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  kst.setDate(kst.getDate() - days);
  return kst.toISOString().split('T')[0];
}
