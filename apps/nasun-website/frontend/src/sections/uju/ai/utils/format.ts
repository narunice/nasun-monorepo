/**
 * Shared formatting utilities for Nasun AI UI (ported from baram/frontend/src/utils/format.ts).
 */

export function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr || '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatNusdcValue(amount: number): string {
  return (amount / 1e6).toFixed(2);
}

export function formatDate(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
