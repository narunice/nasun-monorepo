/**
 * Dashboard formatting helpers.
 *
 * Backend NUMERIC(30,0) money fields come back as decimal strings (USDC raw
 * units, 6 decimals). Reuse the global formatNusdc helpers via bigint parsing
 * — never `Number(str)`, which truncates large positions.
 */

import { formatNusdcFixed } from '../../lib/format';

export function fmtUsdc(raw: string | bigint | null | undefined): string {
  if (raw === null || raw === undefined) return '—';
  try {
    const v = typeof raw === 'bigint' ? raw : BigInt(raw);
    return formatNusdcFixed(v);
  } catch {
    return '—';
  }
}

/**
 * Render a raw scaled share-price integer as a 4-decimal human number.
 * 1_000_000_000 = 1.0 pps (chain convention; mirrors bankroll_pool.move).
 * Bad input returns '—' so the UI never throws on a malformed string.
 */
export function fmtSharePrice(scaled: string): string {
  let n: bigint;
  try { n = BigInt(scaled); } catch { return '—'; }
  const whole = n / 1_000_000_000n;
  const frac = (n % 1_000_000_000n) / 100_000n; // → 4-decimal precision
  return `${whole.toString()}.${frac.toString().padStart(4, '0')}`;
}

/** Signed variant for PnL columns. Fixed 2-decimal to prevent cell overflow. */
export function fmtUsdcSigned(raw: string | bigint | null | undefined): string {
  if (raw === null || raw === undefined) return '—';
  try {
    const v = typeof raw === 'bigint' ? raw : BigInt(raw);
    const formatted = formatNusdcFixed(v);
    if (v > 0n) return `+${formatted}`;
    return formatted;
  } catch {
    return '—';
  }
}

const GAME_LABEL: Record<string, string> = {
  lottery: 'Lottery',
  scratchcard: 'Scratch',
  numbermatch: 'Number Match',
  crash: 'Crash',
  mines: 'Mines',
  wheel: 'Wheel',
};

export function gameLabel(key: string): string {
  return GAME_LABEL[key] ?? key;
}

/** basis points (0–10000) → percentage with 2 decimals. */
export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** Multiplier basis points (10000 = 1.00x) → 2-decimal multiplier label. */
export function multiplierBpsToX(bps: number | string): string {
  const n = typeof bps === 'string' ? Number(bps) : bps;
  if (!Number.isFinite(n)) return '—';
  return `${(n / 10000).toFixed(2)}x`;
}

export function fmtTimeAgo(ms: number | null | undefined): string {
  if (!ms) return '—';
  const delta = Date.now() - ms;
  if (delta < 0) return 'just now';
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString('en-US');
}

export function fmtAbsoluteTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortWallet(addr: string | null | undefined): string {
  if (!addr) return '—';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
