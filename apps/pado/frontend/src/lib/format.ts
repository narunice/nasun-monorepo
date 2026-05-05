/**
 * Shared formatting utilities for Pado frontend.
 * Canonical source for NUSDC formatting.
 */

/** Format NUSDC amount (6 decimals) for display with locale formatting and 2 decimal places. */
export function formatNusdc(amount: bigint): string {
  const value = Number(amount) / 1_000_000;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format NUSDC bigint as compact human-readable volume ("1.2K", "3.4M", or raw integer). */
export function formatVolumeCompact(raw: bigint): string {
  const n = Number(raw) / 1_000_000;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

/** Format ms timestamp into compact relative-time string ("5s ago", "2m ago", "3h ago", "4d ago"). */
export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
