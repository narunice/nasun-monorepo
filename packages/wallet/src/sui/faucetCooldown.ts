/**
 * Faucet Cooldown Utility
 *
 * localStorage-based cooldown tracking for all token faucets.
 * Resets daily at 00:00 UTC (09:00 KST). One claim per reset period.
 *
 * For on-chain tokens (NBTC/NUSDC/NETH/NSOL), this is a UX cache -- the contract
 * enforces the real cooldown. For NSN (HTTP API), this is the primary enforcement.
 */

const RESET_INTERVAL_MS = 86_400_000; // 24 hours
const RESET_HOUR_UTC = 0; // 00:00 UTC = 09:00 KST
const KEY_PREFIX = 'faucet_cooldown_';

function getCooldownKey(address: string, symbol: string): string {
  return `${KEY_PREFIX}${address}_${symbol}`;
}

/**
 * Get the next reset boundary timestamp (ms).
 * Reset occurs daily at 00:00 UTC (09:00 KST).
 */
function getNextResetTime(): number {
  const now = new Date();
  const todayReset = new Date(now);
  todayReset.setUTCHours(RESET_HOUR_UTC, 0, 0, 0);

  if (now.getTime() >= todayReset.getTime()) {
    // Today's reset already passed, next is tomorrow
    todayReset.setUTCDate(todayReset.getUTCDate() + 1);
  }

  return todayReset.getTime();
}

/**
 * Get remaining cooldown time in milliseconds.
 * Returns 0 if the token can be claimed (no claim in current reset period).
 */
export function getCooldownRemaining(address: string, symbol: string): number {
  try {
    const key = getCooldownKey(address, symbol);
    const stored = localStorage.getItem(key);
    if (!stored) return 0;
    const lastClaim = parseInt(stored, 10);
    if (isNaN(lastClaim)) return 0;

    const nextReset = getNextResetTime();
    const prevReset = nextReset - RESET_INTERVAL_MS;

    // If last claim was before the most recent reset boundary, cooldown is over
    if (lastClaim < prevReset) return 0;

    // Claimed in current period, cooldown until next reset
    return Math.max(0, nextReset - Date.now());
  } catch {
    // localStorage may be unavailable (SSR, private browsing)
    return 0;
  }
}

/**
 * Record a successful faucet claim timestamp.
 * Dispatches a custom event so all useTokenFaucet instances re-render.
 */
export function setCooldownTimestamp(address: string, symbol: string): void {
  try {
    const key = getCooldownKey(address, symbol);
    localStorage.setItem(key, String(Date.now()));
    // Notify all hook instances on this page to re-check cooldown
    window.dispatchEvent(new CustomEvent(COOLDOWN_CHANGE_EVENT));
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Remove a previously set cooldown (used for rollback on failed requests).
 */
export function clearCooldownTimestamp(address: string, symbol: string): void {
  try {
    const key = getCooldownKey(address, symbol);
    localStorage.removeItem(key);
    window.dispatchEvent(new CustomEvent(COOLDOWN_CHANGE_EVENT));
  } catch {
    // localStorage may be unavailable
  }
}

/** Custom event name for cross-instance cooldown notifications */
export const COOLDOWN_CHANGE_EVENT = 'nasun-faucet-cooldown-change';

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
