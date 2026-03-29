/**
 * Ecosystem Score Configuration
 *
 * NFT multiplier values and bonus pools for ecosystem points.
 * All numeric values can be overridden via environment variables.
 * Changes take effect on PM2 restart (no deploy needed).
 */

// Safe parse helpers: return default on NaN/invalid input
function safeFloat(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function safeInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

// NFT Multiplier Config
// Base multiplier is 1.0 (no NFTs activated).
// Each activated NFT type adds to the base.
export const MULTIPLIER_CONFIG = {
  alliance: safeFloat(process.env.ECO_MULT_ALLIANCE, 1.0),
  genesisPass: safeFloat(process.env.ECO_MULT_GENESIS_PASS, 1.5),
  battalion: {
    base: safeFloat(process.env.ECO_MULT_BATTALION_BASE, 1.0),
    logCoefficient: safeFloat(process.env.ECO_MULT_BATTALION_LOG_K, 0.8),
  },
};

// Bonus pool config (for Step 5B, deferred)
export const BONUS_CONFIG = {
  padoPnlDailyPool: safeInt(process.env.ECO_BONUS_PNL_POOL, 1000),
  padoGameLogCoefficient: safeFloat(process.env.ECO_BONUS_GAME_LOG_K, 5.0),
  padoGameDailyCap: safeInt(process.env.ECO_BONUS_GAME_CAP, 50),
  dailyLeaderboardPool: safeInt(process.env.ECO_BONUS_DAILY_LB_POOL, 500),
  weeklyLeaderboardPool: safeInt(process.env.ECO_BONUS_WEEKLY_LB_POOL, 2000),
};

// Matview refresh config
export const MATVIEW_REFRESH_MIN_INTERVAL_MS = safeInt(process.env.ECO_MATVIEW_MIN_INTERVAL_MS, 5 * 60 * 1000);
export const MATVIEW_REFRESH_MAX_STALE_MS = safeInt(process.env.ECO_MATVIEW_MAX_STALE_MS, 15 * 60 * 1000);

// Ecosystem activations cache (from admin API)
export const ACTIVATIONS_CACHE_REFRESH_MS = safeInt(process.env.ECO_ACTIVATIONS_CACHE_MS, 3 * 60 * 60 * 1000);
// Floor 30s to prevent rapid-fire retry on misconfigured env var
export const ACTIVATIONS_ERROR_RETRY_MS = Math.max(30_000, safeInt(process.env.ECO_ACTIVATIONS_ERROR_RETRY_MS, 5 * 60 * 1000));

// Excluded categories (authoritative source: ecosystem-schema.sql matview definition)
// Kept as reference. If modifying, update the SQL matview and recreate.
// 'referral-bonus', 'daily-mission', 'wallet-transfer',
// 'ecosystem-bonus-pnl', 'ecosystem-bonus-rank', 'ecosystem-bonus-game', 'ecosystem-bonus-diversity'

// Activation types
export interface NftActivation {
  nftType: string;
  status: string;
  nftCount: number;
}

// Range guard: env var misconfiguration (0, negative) cannot zero out all scores
export const MAX_MULTIPLIER = Math.max(1.0, Math.min(safeFloat(process.env.ECO_MAX_MULTIPLIER, 20.0), 100.0));

/**
 * Per-activation bonus calculation. Single source of truth for multiplier formula.
 * Used by both calculateMultiplier (scoring) and routes (API bonus field).
 */
export function getActivationBonus(act: NftActivation): number {
  if (act.status !== 'ACTIVE') return 0;
  switch (act.nftType) {
    case 'alliance':
      return MULTIPLIER_CONFIG.alliance;
    case 'genesis-pass':
      return MULTIPLIER_CONFIG.genesisPass;
    case 'battalion': {
      const count = Math.max(1, act.nftCount);
      return (
        MULTIPLIER_CONFIG.battalion.base +
        Math.log(count) * MULTIPLIER_CONFIG.battalion.logCoefficient
      );
    }
    default:
      // Sanitize external API data before logging (prevent log injection)
      console.warn(
        `[Ecosystem] Unknown nftType ignored: ${String(act.nftType).slice(0, 50).replace(/[^\w-]/g, '_')}`,
      );
      return 0;
  }
}

/**
 * Calculate total multiplier for a user based on their NFT activations.
 * Formula: 1.0 (base) + sum of per-activation bonuses, capped at MAX_MULTIPLIER.
 */
export function calculateMultiplier(activations: NftActivation[]): number {
  let multiplier = 1.0;
  for (const act of activations) {
    multiplier += getActivationBonus(act);
  }
  return Math.min(multiplier, MAX_MULTIPLIER);
}
