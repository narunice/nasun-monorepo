/**
 * Shared formatting utilities for Nasun AI UI (ported from baram/frontend/src/utils/format.ts).
 */

export function truncateHash(hash: string, chars = 8): string {
  if (!hash || hash.length <= chars * 2 + 2) return hash || '-';
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

export function formatTimestamp(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US');
}

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

export function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr || '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatNusdcValue(amount: number): string {
  return (amount / 1e6).toFixed(2);
}

/**
 * Format raw NUSDC (1e6 minor units) as a display string with `NUSDC` suffix.
 * Null/undefined/NaN return `-`; default precision is 2 decimals but callers
 * that need more precision (e.g. fee receipts in the AER viewer) can override
 * via `opts.decimals`. PaymentContext.payment_token is reserved for future
 * multi-token settlement; until that lands the suffix stays hardcoded.
 */
export function formatNusdc(
  amount: number | null | undefined,
  opts?: { decimals?: number },
): string {
  if (amount == null || !Number.isFinite(amount)) return '-';
  const decimals = opts?.decimals ?? 2;
  return `${(amount / 1e6).toFixed(decimals)} NUSDC`;
}

export function formatNasun(amount: number): string {
  return `${(amount / 1e9).toLocaleString('en-US')} NASUN`;
}

export function nusdcToRaw(displayAmount: string): number {
  const trimmed = displayAmount.trim();
  if (!trimmed) return 0;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 0;
  const [wholePart, fracPart = ''] = trimmed.split('.');
  const paddedFrac = (fracPart + '000000').slice(0, 6);
  const raw = Number(wholePart) * 1_000_000 + Number(paddedFrac);
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw;
}

export function formatMessageTime(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US');
}

export function parseOptionField<T>(field: unknown): T | null {
  if (field == null) return null;
  if (typeof field === 'object' && 'vec' in (field as Record<string, unknown>)) {
    const vec = (field as { vec: T[] }).vec;
    return vec.length > 0 ? vec[0] : null;
  }
  return field as T;
}
