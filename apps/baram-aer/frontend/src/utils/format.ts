/**
 * Shared formatting utilities for Baram UI
 */

export function truncateHash(hash: string, chars = 8): string {
  if (!hash || hash.length <= chars * 2 + 2) return hash || '-';
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

export function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr || '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatNusdc(amount: number): string {
  return `${(amount / 1e6).toFixed(2)} NUSDC`;
}

/** Format NUSDC raw amount to display value (without unit suffix) */
export function formatNusdcValue(amount: number): string {
  return (amount / 1e6).toFixed(2);
}

/**
 * Convert user-entered NUSDC display amount to raw integer (6 decimals).
 * Uses Math.round to avoid floating-point precision issues.
 * Returns 0 for invalid inputs.
 */
export function nusdcToRaw(displayAmount: string): number {
  const parsed = parseFloat(displayAmount);
  if (isNaN(parsed) || parsed < 0) return 0;
  const raw = Math.round(parsed * 1e6);
  if (!Number.isSafeInteger(raw)) return 0;
  return raw;
}

export function formatNasun(amount: number): string {
  return `${(amount / 1e9).toLocaleString('en-US')} NASUN`;
}

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

/** Format timestamp as short time (HH:MM AM/PM) for chat messages */
export function formatMessageTime(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
