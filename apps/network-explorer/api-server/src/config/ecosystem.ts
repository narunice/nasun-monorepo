/**
 * Ecosystem Score Configuration
 *
 * NFT multiplier values and bonus pools for ecosystem points.
 * All numeric values can be overridden via environment variables.
 * Changes take effect on PM2 restart (no deploy needed).
 */

// Safe parse helpers: return default on NaN/invalid input
export function safeFloat(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function safeInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

// V3 Health System config
// Alliance only: alliance_health is the multiplier itself (5-step).
// Alliance + GP: alliance is locked at 1.0, gp_bonus varies (6-step).
// No grace days.
export const HEALTH_CONFIG = {
  alliance:    { steps: [0, 25, 50, 75, 100] as const },
  genesisPass: { steps: [0, 20, 40, 60, 80, 100] as const },
} satisfies {
  alliance:    { steps: readonly number[] };
  genesisPass: { steps: readonly number[] };
};

let _cutoffDate: string | undefined;
export function getHealthV2CutoffDate(): string {
  if (_cutoffDate) return _cutoffDate;
  const raw = process.env.ECO_HEALTH_V2_CUTOFF ?? '9999-12-31';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw + 'T00:00:00Z'))) {
    throw new Error(`[Ecosystem] ECO_HEALTH_V2_CUTOFF invalid: "${raw}"`);
  }
  _cutoffDate = raw;
  return _cutoffDate;
}

export function isV2CutoverActive(dateStr: string): boolean {
  return dateStr >= getHealthV2CutoffDate();
}

export interface NftHealth {
  /** Alliance health % (0..100). For GP holders this is forced to 100. */
  alliance: number;
  /** GP bonus * 100 (0..100). Meaningful only when hasGp. */
  genesisPass: number;
}

/**
 * V3 multiplier formula.
 *   hasAlliance && !hasGp → alliance_health / 100
 *   hasAlliance && hasGp  → 1.0 + gp_bonus / 100
 *   !hasAlliance          → 0  (no alliance = no points)
 * Range: [0.0, 2.0].
 */
export function calculateMultiplierV2(
  h: NftHealth,
  hasAlliance: boolean,
  hasGp: boolean,
): number {
  if (!hasAlliance) return 0;
  if (hasGp) return 1.0 + h.genesisPass / 100;
  return h.alliance / 100;
}

// NFT Multiplier Config (V1)
// Multiplier = max(base tier) + battalion stack, capped at MAX_MULTIPLIER.
// No active NFTs -> 0 (disabled). Any active NFT -> at least alliance base (1x).
export const MULTIPLIER_CONFIG = {
  // Base tier multipliers (highest wins, not additive)
  alliance: safeFloat(process.env.ECO_MULT_ALLIANCE, 1),
  genesisPass: safeFloat(process.env.ECO_MULT_GENESIS_PASS, 2),
  // Battalion stacks on top of the base tier
  battalion: {
    perUnit: safeFloat(process.env.ECO_MULT_BATTALION_PER_UNIT, 5.0),
    maxUnits: safeInt(process.env.ECO_MULT_BATTALION_MAX_UNITS, 10),
  },
};

// Activations cache refresh interval (12h default, per-user sync for immediate updates)
export const ACTIVATIONS_CACHE_REFRESH_MS = safeInt(process.env.ECO_ACTIVATIONS_CACHE_MS, 12 * 60 * 60 * 1000);

// Matview refresh config
export const MATVIEW_REFRESH_MIN_INTERVAL_MS = safeInt(process.env.ECO_MATVIEW_MIN_INTERVAL_MS, 5 * 60 * 1000);
export const MATVIEW_REFRESH_MAX_STALE_MS = safeInt(process.env.ECO_MATVIEW_MAX_STALE_MS, 15 * 60 * 1000);

// Floor 30s to prevent rapid-fire retry on misconfigured env var
export const ACTIVATIONS_ERROR_RETRY_MS = Math.max(30_000, safeInt(process.env.ECO_ACTIVATIONS_ERROR_RETRY_MS, 5 * 60 * 1000));

// Excluded categories (authoritative source: ecosystem-schema.sql matview definition)
// Kept as reference. If modifying, update the SQL matview and recreate.
// 'referral-bonus', 'daily-mission', 'ecosystem-passive', 'staking-daily', 'staking',
// 'ecosystem-bonus-*' (all bonus subcategories)

// Activation types
export interface NftActivation {
  nftType: string;
  status: string;
  nftCount: number;
}

// Range guard: env var misconfiguration (0, negative) cannot zero out all scores
export const MAX_MULTIPLIER = Math.max(1.0, Math.min(safeFloat(process.env.ECO_MAX_MULTIPLIER, 20.0), 100.0));

/**
 * Per-activation contribution to the multiplier.
 * For base-tier NFTs (alliance, genesis-pass): returns the tier's base multiplier.
 * For stackable NFTs (battalion): returns the additive bonus.
 * Used by routes for the API `bonus` field display.
 */
export function getActivationBonus(act: NftActivation): number {
  if (act.status !== 'ACTIVE') return 0;
  switch (act.nftType) {
    case 'alliance':
      return MULTIPLIER_CONFIG.alliance;
    case 'genesis-pass':
      return MULTIPLIER_CONFIG.genesisPass;
    case 'battalion': {
      const count = Math.min(Math.max(0, act.nftCount), MULTIPLIER_CONFIG.battalion.maxUnits);
      return count * MULTIPLIER_CONFIG.battalion.perUnit;
    }
    default:
      console.warn(
        `[Ecosystem] Unknown nftType ignored: ${String(act.nftType).slice(0, 50).replace(/[^\w-]/g, '_')}`,
      );
      return 0;
  }
}

/**
 * Calculate total multiplier for a user based on their NFT activations.
 *
 * V1 formula: max(base tier) + battalion stack, capped at MAX_MULTIPLIER.
 *
 * Base tier (highest wins, not additive):
 *   - Alliance: 1x
 *   - Genesis Pass: 2x
 * Stackable (additive on top of base):
 *   - Battalion: 5x per unit
 *
 * No active NFTs -> 0 (disabled; base scores recorded but ecosystem score stays 0).
 * Example: Genesis(2x) + Battalion x3(15x) = 17x
 */
export function calculateMultiplier(activations: NftActivation[]): number {
  let baseTier = 0;
  let battalionStack = 0;
  let hasActive = false;

  for (const act of activations) {
    if (act.status !== 'ACTIVE') continue;
    hasActive = true;
    switch (act.nftType) {
      case 'alliance':
        baseTier = Math.max(baseTier, MULTIPLIER_CONFIG.alliance);
        break;
      case 'genesis-pass':
        baseTier = Math.max(baseTier, MULTIPLIER_CONFIG.genesisPass);
        break;
      case 'battalion': {
        const count = Math.min(Math.max(0, act.nftCount), MULTIPLIER_CONFIG.battalion.maxUnits);
        battalionStack += count * MULTIPLIER_CONFIG.battalion.perUnit;
        break;
      }
    }
  }

  if (!hasActive) return 0;
  return Math.min(baseTier + battalionStack, MAX_MULTIPLIER);
}
