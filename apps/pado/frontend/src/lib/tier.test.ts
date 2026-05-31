/**
 * Tier discount parity test (Move ↔ JS).
 *
 * SSOTs:
 *   - On-chain: `packages/nasun-tier/sources/policy.move::fee_discount_bps`
 *   - Off-chain mirror: `@nasun/standing` (TIER_BENEFITS, source-parity tested
 *     against the JSON_ANCHOR block at the bottom of policy.move)
 *
 * This test asserts:
 *   1. The fee discount values Pado frontend uses come from `@nasun/standing`,
 *      which itself is locked to the Move source via source-parity test.
 *   2. The Move-side integer arithmetic `(baseline × (10000 - discount)) / 10000`
 *      produces the expected scaled-fee values for both taker and maker baselines.
 *
 * Fees on-chain are stored as `bps × 100_000` (deepbook FLOAT_SCALING-like
 * scaling for trade_params; 1 bps = 100_000). The same multiply-then-divide
 * applies on-chain via plain u64 integer math in `process_create_with_tier`.
 *
 * If `policy.move::fee_discount_bps` changes, update the JSON_ANCHOR block in
 * that file AND TIER_BENEFITS in `packages/nasun-standing/src/benefits.ts` —
 * the source-parity test in @nasun/standing catches the drift. This test then
 * picks up the new values automatically via the package import.
 */
import { describe, it, expect } from 'vitest';
import { TIER_BENEFITS, type Tier } from '@nasun/standing';

const POLICY_FEE_DISCOUNT_BPS: Record<Tier, number> = {
  1: TIER_BENEFITS[1].fee_discount_bps,
  2: TIER_BENEFITS[2].fee_discount_bps,
  3: TIER_BENEFITS[3].fee_discount_bps,
};

// Mirrors Move integer arithmetic: `(baseline * (10000 - discount)) / 10000`
// using u64 truncating divide.
function applyDiscountIntegerScaled(scaledFee: number, tier: Tier): number {
  const discount = POLICY_FEE_DISCOUNT_BPS[tier];
  return Math.floor((scaledFee * (10000 - discount)) / 10000);
}

describe('tier discount parity (Move ↔ JS)', () => {
  // Phase 3 on-chain baseline (post-Track B8 admin_set_trade_params).
  // taker = 4 bps → 400_000 scaled. maker = 1.5 bps → 150_000 scaled.
  describe('taker baseline 400_000 (4 bps)', () => {
    it.each<[Tier, number, string]>([
      [1, 400_000, '4 bps'],     // no discount
      [2, 260_000, '2.6 bps'],   // 400_000 × 6500 / 10000
      [3, 160_000, '1.6 bps'],   // 400_000 × 4000 / 10000
    ])('tier %i → %i (%s)', (tier, expected) => {
      expect(applyDiscountIntegerScaled(400_000, tier)).toBe(expected);
    });
  });

  describe('maker baseline 150_000 (1.5 bps)', () => {
    it.each<[Tier, number, string]>([
      [1, 150_000, '1.5 bps'],
      [2, 97_500, '0.975 bps'],  // 150_000 × 6500 / 10000
      [3, 60_000, '0.6 bps'],    // 150_000 × 4000 / 10000
    ])('tier %i → %i (%s)', (tier, expected) => {
      expect(applyDiscountIntegerScaled(150_000, tier)).toBe(expected);
    });
  });

  it('tier 1 = no discount', () => {
    expect(POLICY_FEE_DISCOUNT_BPS[1]).toBe(0);
  });

  it('tier 2 = 35% discount', () => {
    expect(POLICY_FEE_DISCOUNT_BPS[2]).toBe(3500);
  });

  it('tier 3 = 60% discount', () => {
    expect(POLICY_FEE_DISCOUNT_BPS[3]).toBe(6000);
  });
});
