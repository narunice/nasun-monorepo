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
 * Uses string-based arithmetic to avoid IEEE-754 floating-point drift.
 * Returns 0 for invalid inputs or amounts exceeding Number.MAX_SAFE_INTEGER.
 */
export function nusdcToRaw(displayAmount: string): number {
  const trimmed = displayAmount.trim();
  if (!trimmed) return 0;

  // Only allow digits with optional single decimal point
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 0;

  const [wholePart, fracPart = ''] = trimmed.split('.');
  // Pad or truncate fractional part to exactly 6 digits
  const paddedFrac = (fracPart + '000000').slice(0, 6);

  // Integer arithmetic only — no floating-point multiplication
  const raw = Number(wholePart) * 1_000_000 + Number(paddedFrac);
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
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

/** Format timestamp as time with seconds (for AER timeline) */
export function formatTimeDetailed(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Format timestamp as short time (month + day + hour:minute) */
export function formatTimeShort(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format timestamp as date only (month + day + year) */
export function formatDate(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Parse a Move Option<T> field from JSON RPC response.
 * Move Option is serialized as { vec: [value] } or { vec: [] }.
 */
export function parseOptionField<T>(field: unknown): T | null {
  if (field == null) return null;
  if (typeof field === 'object' && 'vec' in (field as Record<string, unknown>)) {
    const vec = (field as { vec: T[] }).vec;
    return vec.length > 0 ? vec[0] : null;
  }
  return field as T;
}
