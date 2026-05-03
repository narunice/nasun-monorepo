/**
 * Ecosystem Score Configuration
 *
 * Score calculation uses the V3 health-based multiplier (calculateMultiplier
 * below). The legacy additive battalion-stack formula was retired on
 * 2026-05-02 (cutover); pre-cutover snapshot rows preserve their original
 * scores via the `multiplier` / `ecosystem_score` columns and are read
 * through COALESCE in the snapshot history endpoint.
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
export function calculateMultiplier(
  h: NftHealth,
  hasAlliance: boolean,
  hasGp: boolean,
): number {
  if (!hasAlliance) return 0;
  if (hasGp) return 1.0 + h.genesisPass / 100;
  return h.alliance / 100;
}

// Backward-compat alias for the V2 name. New code should import
// `calculateMultiplier`.
export const calculateMultiplierV2 = calculateMultiplier;

// Activations cache refresh interval (12h default, per-user sync for immediate updates)
export const ACTIVATIONS_CACHE_REFRESH_MS = safeInt(process.env.ECO_ACTIVATIONS_CACHE_MS, 12 * 60 * 60 * 1000);

// Matview refresh config
export const MATVIEW_REFRESH_MIN_INTERVAL_MS = safeInt(process.env.ECO_MATVIEW_MIN_INTERVAL_MS, 5 * 60 * 1000);
export const MATVIEW_REFRESH_MAX_STALE_MS = safeInt(process.env.ECO_MATVIEW_MAX_STALE_MS, 15 * 60 * 1000);

// Floor 30s to prevent rapid-fire retry on misconfigured env var
export const ACTIVATIONS_ERROR_RETRY_MS = Math.max(30_000, safeInt(process.env.ECO_ACTIVATIONS_ERROR_RETRY_MS, 5 * 60 * 1000));

// Activation types
export interface NftActivation {
  nftType: string;
  status: string;
  nftCount: number;
}

/**
 * Per-NFT display bonus for the EcosystemStatusCard badge ("+1.0x", "+2.0x").
 * Purely informational; the live multiplier is computed via calculateMultiplier
 * from health state, not from these values. Kept stable so the per-NFT badges
 * keep their familiar look post-cutover.
 */
const DISPLAY_BONUS = {
  alliance: 1.0,
  'genesis-pass': 2.0,
  battalion: 0,
};
export function getActivationBonus(act: NftActivation): number {
  if (act.status !== 'ACTIVE') return 0;
  return DISPLAY_BONUS[act.nftType as keyof typeof DISPLAY_BONUS] ?? 0;
}
