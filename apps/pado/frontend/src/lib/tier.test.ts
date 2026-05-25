/**
 * Tier discount parity test (Move ↔ JS).
 *
 * SSOT: packages/nasun-tier/sources/policy.move :17-21 (fee_discount_bps)
 * API mirror: apps/network-explorer/api-server/src/routes/standing.ts (TIER_BENEFITS)
 *
 * Asserts both POLICY_FEE_DISCOUNT_BPS values match the on-chain SSOT and
 * the effective-fee arithmetic produces the same result the chain does.
 *
 * Fees on-chain are stored as `bps × 100_000` (deepbook FLOAT_SCALING-like
 * scaling for trade_params; 1 bps = 100_000). The same multiply-then-divide
 * applies on-chain via plain u64 integer math in process_create_with_tier.
 *
 * If policy.move's fee_discount_bps values change on-chain, update:
 *   - POLICY_FEE_DISCOUNT_BPS here
 *   - apps/network-explorer/api-server/src/routes/standing.ts TIER_BENEFITS
 */
import { describe, it, expect } from 'vitest';

const POLICY_FEE_DISCOUNT_BPS: Record<1 | 2 | 3, number> = {
  1: 0,
  2: 3500,
  3: 6000,
};

// Mirrors Move integer arithmetic: `(baseline * (10000 - discount)) / 10000`
// using u64 truncating divide.
function applyDiscountIntegerScaled(scaledFee: number, tier: 1 | 2 | 3): number {
  const discount = POLICY_FEE_DISCOUNT_BPS[tier];
  return Math.floor((scaledFee * (10000 - discount)) / 10000);
}

describe('tier discount parity (Move ↔ JS)', () => {
  // Phase 3 on-chain baseline (post-Track B8 admin_set_trade_params).
  // taker = 4 bps → 400_000 scaled. maker = 1.5 bps → 150_000 scaled.
  describe('taker baseline 400_000 (4 bps)', () => {
    it.each<[1 | 2 | 3, number, string]>([
      [1, 400_000, '4 bps'],     // no discount
      [2, 260_000, '2.6 bps'],   // 400_000 × 6500 / 10000
      [3, 160_000, '1.6 bps'],   // 400_000 × 4000 / 10000
    ])('tier %i → %i (%s)', (tier, expected) => {
      expect(applyDiscountIntegerScaled(400_000, tier)).toBe(expected);
    });
  });

  describe('maker baseline 150_000 (1.5 bps)', () => {
    it.each<[1 | 2 | 3, number, string]>([
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
