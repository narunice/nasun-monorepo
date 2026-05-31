import type { Tier, TierBenefits } from './types.js';

/**
 * TS mirror of `packages/nasun-tier/sources/policy.move`.
 *
 * The Move package is the on-chain SSOT (enforced by Pado DeepBook fork,
 * GoStop contracts, vault manager, AI subsidy paths). This TS mirror is what
 * off-chain consumers — explorer-api responses, NavStandingBadge, leaderboard
 * displays — read. Drift between the two is blocked by
 * `__tests__/source-parity.test.ts`, which parses the `JSON_ANCHOR` block in
 * `policy.move` and asserts equality.
 *
 * USD vs micro-units: `policy.move::max_bet_floor_usdc` returns NUSDC micro-
 * units (6 decimals). The TS mirror exposes BOTH:
 *   - `gostop_max_bet_usdc_micro` — matches Move integer literal exactly (used
 *     by source-parity test)
 *   - `gostop_max_bet_usd` — display value for UIs (= micro / 1_000_000)
 */
export const TIER_BENEFITS: Readonly<Record<Tier, TierBenefits>> = {
  1: {
    fee_discount_bps: 0,
    staking_multiplier_bps: 10000,
    lp_yield_multiplier_bps: 10000,
    inference_subsidy_bps: 0,
    gostop_max_bet_usdc_micro: 100_000_000,
    gostop_max_bet_usd: 100,
    can_create_vault: false,
  },
  2: {
    fee_discount_bps: 3500,
    staking_multiplier_bps: 12500,
    lp_yield_multiplier_bps: 13000,
    inference_subsidy_bps: 3000,
    gostop_max_bet_usdc_micro: 1_000_000_000,
    gostop_max_bet_usd: 1000,
    can_create_vault: false,
  },
  3: {
    fee_discount_bps: 6000,
    staking_multiplier_bps: 15000,
    lp_yield_multiplier_bps: 16000,
    inference_subsidy_bps: 6000,
    gostop_max_bet_usdc_micro: 10_000_000_000,
    gostop_max_bet_usd: 10000,
    can_create_vault: true,
  },
} as const;
