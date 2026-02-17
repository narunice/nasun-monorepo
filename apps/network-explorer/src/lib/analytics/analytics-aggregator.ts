/**
 * Calculate percentage trend between two values.
 * Returns NaN if previous is 0.
 */
export function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Format large numbers with K/M/B suffixes.
 */
export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

/**
 * Convert a timestamp (ms) to a date key string (YYYY-MM-DD) in UTC.
 */
export function toDayKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a YYYY-MM-DD date key to a short display format (e.g., "Feb 17").
 */
export function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Get UTC midnight timestamp for a given date key.
 */
export function dayKeyToMs(dateKey: string): number {
  return new Date(dateKey + 'T00:00:00Z').getTime();
}

/**
 * Get the number of days for a time range.
 */
export function timeRangeToDays(range: '7d' | '30d' | 'all'): number {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  return 90; // "all" capped at 90 days
}
