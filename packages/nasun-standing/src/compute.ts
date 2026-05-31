import { TIER_2_THRESHOLD, TIER_3_THRESHOLD } from './thresholds.js';
import type { Tier } from './types.js';

/**
 * Derive raw NSI tier from a score.
 *
 * Score must be a finite non-negative number. Negative or NaN inputs default
 * to tier 1 — the caller is responsible for upstream validation but the
 * function is defensive to avoid propagating bad data into a downgrade.
 */
export function nsiToTier(nsi: number): Tier {
  if (!Number.isFinite(nsi) || nsi < 0) return 1;
  if (nsi >= TIER_3_THRESHOLD) return 3;
  if (nsi >= TIER_2_THRESHOLD) return 2;
  return 1;
}

/**
 * Apply the Genesis Pass floor: GP holders are guaranteed tier 2 minimum
 * regardless of NSI score. Final tier is `MAX(nsiTier, gp_floor)`.
 */
export function applyGpFloor(nsiTier: Tier, hasGp: boolean): Tier {
  const floor: Tier = hasGp ? 2 : 1;
  return (nsiTier >= floor ? nsiTier : floor) as Tier;
}

/**
 * Next-tier threshold for display ("X points to next tier"). Returns null at
 * tier 3 — there is no higher tier in Phase 1.
 */
export function nextThreshold(tier: Tier): number | null {
  if (tier === 1) return TIER_2_THRESHOLD;
  if (tier === 2) return TIER_3_THRESHOLD;
  return null;
}

/**
 * Monotone-up display policy: during a launch / formula-cutover window the
 * surfaced tier never decreases. Once the window expires the actual tier is
 * shown. Implemented as `MAX(currentTier, maxSeenTier)` while active.
 *
 * Off-chain only — the `tier-push-worker` writes display tier to on-chain
 * `TierRegistry`, so on-chain consumers also honor the floor during the
 * window. That coupling is intentional for Phase 1 (the user-visible
 * benefit doesn't disappear mid-window). Phase 2 may split `tier_raw` vs
 * `tier_display` if that coupling needs to change.
 */
export function monotoneUpDisplayTier(
  currentTier: Tier,
  maxSeenTier: Tier,
  windowUntil: Date | null,
  now: Date,
): Tier {
  if (windowUntil === null) return currentTier;
  if (now.getTime() >= windowUntil.getTime()) return currentTier;
  return (currentTier >= maxSeenTier ? currentTier : maxSeenTier) as Tier;
}
