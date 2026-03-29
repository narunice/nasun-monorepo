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
export const MATVIEW_REFRESH_MIN_INTERVAL_MS = parseInt(
  process.env.ECO_MATVIEW_MIN_INTERVAL_MS ?? String(5 * 60 * 1000),
  10,
);
export const MATVIEW_REFRESH_MAX_STALE_MS = parseInt(
  process.env.ECO_MATVIEW_MAX_STALE_MS ?? String(15 * 60 * 1000),
  10,
);

// Ecosystem activations cache (from admin API)
export const ACTIVATIONS_CACHE_REFRESH_MS = parseInt(
  process.env.ECO_ACTIVATIONS_CACHE_MS ?? String(3 * 60 * 60 * 1000),
  10,
);

// Categories excluded from ecosystem base score
// These are bonus/system categories that should not count toward base score
export const EXCLUDED_CATEGORIES = [
  'referral-bonus',
  'daily-mission',
  'wallet-transfer',
  'ecosystem-bonus-pnl',
  'ecosystem-bonus-rank',
  'ecosystem-bonus-game',
  'ecosystem-bonus-diversity',
] as const;

// Activation types
export interface NftActivation {
  nftType: string;
  status: string;
  nftCount: number;
}

/**
 * Calculate total multiplier for a user based on their NFT activations.
 *
 * Formula: 1.0 (base) + alliance + genesisPass + battalion(count)
 * - Alliance: flat bonus
 * - Genesis Pass: flat bonus
 * - Battalion: base + ln(count) * logCoefficient
 */
export function calculateMultiplier(activations: NftActivation[]): number {
  let multiplier = 1.0;

  for (const act of activations) {
    if (act.status !== 'ACTIVE') continue;

    switch (act.nftType) {
      case 'alliance':
        multiplier += MULTIPLIER_CONFIG.alliance;
        break;
      case 'genesis-pass':
        multiplier += MULTIPLIER_CONFIG.genesisPass;
        break;
      case 'battalion': {
        const count = Math.max(1, act.nftCount);
        const bonus =
          MULTIPLIER_CONFIG.battalion.base +
          Math.log(count) * MULTIPLIER_CONFIG.battalion.logCoefficient;
        multiplier += bonus;
        break;
      }
    }
  }

  return multiplier;
}
