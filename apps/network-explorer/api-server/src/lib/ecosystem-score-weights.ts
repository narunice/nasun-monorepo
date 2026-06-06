/**
 * Ecosystem weekly_score rebalance weights: staking emission multiplier and
 * creator-post divisor.
 *
 * Resolution work (handoff 2026-06-05). The weekly leaderboard was dominated by
 * the integer activity_score (a ~25 "daily routine" plateau: faucet + the core
 * gostop games + a transfer, repeated daily). Verified on live W23 data:
 *   - 1,044 identities had a byte-identical activity vector, so NO category
 *     re-weighting can separate them (categorical data has a hard ceiling).
 *   - The only continuous, bot-resistant signals are game BET volume (already
 *     handled by ecosystem-volume-score, but discrete fixed-price games cap it at
 *     ~153 groups) and STAKING EMISSION, which has 4,080 distinct values but at
 *     STAKING_EMISSION_COEFF=0.07 its magnitude (~1.4-8) was dwarfed by
 *     activity_score, so that resolution was wasted.
 *
 * STAKING_WEIGHT_MULT lifts the emission term so its resolution actually counts.
 * Calibrated on live W23 (top-2000 ties): 1.0x -> 22.1%, 1.5x -> 17.3%,
 * 1.8x -> 17.5%. 1.5x captures essentially the full tie reduction with the
 * gentlest redistribution: top-500 retention 464/500 (vs 439 at 1.8x) and a worst
 * faller of 977 ranks (vs 1142 at 1.8x). Higher multipliers (4x+) make the
 * top-500 ~all stakers, which we reject. Staking is bot-resistant (locked capital
 * over time), fair (no alpha gating), and rewards the capital commitment a
 * bootstrapped L1 wants. The riser/faller split is intended: capital-committed
 * users rise, pure-activity non-stakers fall (verified: risers are act=25 stakers,
 * fallers are higher-activity act 30-34 non-stakers — a deliberate tradeoff).
 *
 * CREATOR_POST_DIVISOR 5 -> 4 is a modest incentive bump for content creators
 * (~89 users/week; negligible tie effect, intentional community-building reward).
 *
 * Default cutoff is 2026-W24 (2026-06-08 UTC Monday), aligned with the W24
 * wheel + bet-volume cutover (GAME_VOLUME_START_MS) so the full leaderboard
 * reshaping lands in a single weekly cutover rather than splitting the rank churn
 * across two consecutive weeks (product decision; the tradeoff is that W24's churn
 * mixes the wheel/bet-volume and staking/creator changes). Past weeks (and the
 * in-progress week before the cutoff) recompute with the legacy weights, so
 * historical leaderboards stay immutable. Mirrors LP_LEADERBOARD_START_MS and
 * GAME_VOLUME_START_MS.
 *
 * Single source of truth for the three weekly_score sites: the live leaderboard
 * route (routes/ecosystem.ts: getScoredLeaderboard + getPrevLeaderboard) and the
 * weekly settlement (scripts/settle-ecosystem.ts). The count-only sites do not
 * compute weekly_score, so they are intentionally not weighted here.
 */

import { safeFloat } from '../config/ecosystem.js';

const CREATOR_POST_DIVISOR_LEGACY = 5;

export const STAKING_WEIGHT_MULT = Math.max(
  1,
  safeFloat(process.env.STAKING_WEIGHT_MULT, 1.5),
);

export const CREATOR_POST_DIVISOR = Math.max(
  1,
  safeFloat(process.env.CREATOR_POST_DIVISOR, 4),
);

export const SCORE_REBALANCE_START_MS = (() => {
  const v = safeFloat(process.env.SCORE_REBALANCE_START_MS, Date.UTC(2026, 5, 8));
  return Number.isFinite(v) && v > 0 ? v : Date.UTC(2026, 5, 8);
})();

console.log(
  `[ecosystem-score-weights] stakingMult=${STAKING_WEIGHT_MULT} ` +
    `creatorDivisor=${CREATOR_POST_DIVISOR} startMs=${SCORE_REBALANCE_START_MS} ` +
    `(${new Date(SCORE_REBALANCE_START_MS).toISOString()})`,
);

export function isRebalanced(weekStartMs: number): boolean {
  return weekStartMs >= SCORE_REBALANCE_START_MS;
}

/**
 * Resolve the weekly_score weights for a given week (by its Monday-start epoch
 * ms). Splice the returned scalars into the three weekly_score query sites:
 *   - creator_post_score: `SUM(final_points) / ${creatorDivisor}`
 *   - weekly_score sum:   `+ COALESCE(se.emission_score, 0) * ${stakingMult}`
 */
export function ecosystemScoreWeights(weekStartMs: number): {
  stakingMult: number;
  creatorDivisor: number;
} {
  const rebalanced = isRebalanced(weekStartMs);
  return {
    stakingMult: rebalanced ? STAKING_WEIGHT_MULT : 1.0,
    creatorDivisor: rebalanced ? CREATOR_POST_DIVISOR : CREATOR_POST_DIVISOR_LEGACY,
  };
}
