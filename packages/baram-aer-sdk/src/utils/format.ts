/**
 * Formatting utilities for AER data display
 */

/** Format NUSDC raw amount (6 decimals) to display string with unit */
export function formatNusdc(amount: number): string {
  return `${(amount / 1e6).toFixed(2)} NUSDC`;
}

/** Format NUSDC raw amount to display value without unit */
export function formatNusdcValue(amount: number): string {
  return (amount / 1e6).toFixed(2);
}

/** Format NASUN raw amount (9 decimals) to display string with unit */
export function formatNasun(amount: number): string {
  return `${(amount / 1e9).toLocaleString('en-US')} NASUN`;
}

/** Format millisecond timestamp to locale string */
export function formatTimestamp(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Truncate hex hash for display */
export function truncateHash(hash: string, chars = 8): string {
  if (!hash || hash.length <= chars * 2 + 2) return hash || '-';
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

/** Truncate address for display */
export function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr || '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Format duration in milliseconds to human-readable string */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
