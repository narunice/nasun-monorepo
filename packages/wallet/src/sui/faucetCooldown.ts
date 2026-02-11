/**
 * Faucet Cooldown Utility
 *
 * localStorage-based 24h cooldown tracking for all token faucets.
 * For on-chain tokens (NBTC/NUSDC/NETH/NSOL), this is a UX cache — the contract
 * enforces the real cooldown. For NSN (HTTP API), this is the primary enforcement.
 */

const COOLDOWN_MS = 86_400_000; // 24 hours
const KEY_PREFIX = 'faucet_cooldown_';

function getCooldownKey(address: string, symbol: string): string {
  return `${KEY_PREFIX}${address}_${symbol}`;
}

/**
 * Get remaining cooldown time in milliseconds.
 * Returns 0 if the token can be claimed.
 */
export function getCooldownRemaining(address: string, symbol: string): number {
  try {
    const key = getCooldownKey(address, symbol);
    const stored = localStorage.getItem(key);
    if (!stored) return 0;
    const lastClaim = parseInt(stored, 10);
    if (isNaN(lastClaim)) return 0;
    const elapsed = Date.now() - lastClaim;
    return elapsed >= COOLDOWN_MS ? 0 : COOLDOWN_MS - elapsed;
  } catch {
    // localStorage may be unavailable (SSR, private browsing)
    return 0;
  }
}

/**
 * Record a successful faucet claim timestamp.
 */
export function setCooldownTimestamp(address: string, symbol: string): void {
  try {
    const key = getCooldownKey(address, symbol);
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Format remaining cooldown time for display.
 * Returns empty string if no cooldown.
 */
export function formatCooldownRemaining(ms: number): string {
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `~${hours}h ${minutes}m`;
  if (minutes > 0) return `~${minutes}m`;
  return '<1m';
}
