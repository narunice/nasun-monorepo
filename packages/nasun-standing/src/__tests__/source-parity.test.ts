import { describe, it, expect } from 'vitest';
import { TIER_BENEFITS } from '../index.js';
import { readMovePolicyAnchor } from '../test-utils/parity.js';
import type { Tier } from '../types.js';

/**
 * Source-parity test — blocks drift between `policy.move` and TIER_BENEFITS.
 *
 * If a Move entry function is edited without updating the JSON_ANCHOR (or vice
 * versa), this test fails clearly with the diverging field name and tier.
 */
describe('TIER_BENEFITS ↔ policy.move JSON_ANCHOR', () => {
  const spec = readMovePolicyAnchor();
  const tiers: Tier[] = [1, 2, 3];

  for (const tier of tiers) {
    const key = String(tier) as '1' | '2' | '3';

    it(`tier ${tier}: fee_discount_bps matches`, () => {
      expect(TIER_BENEFITS[tier].fee_discount_bps).toBe(
        spec.fee_discount_bps[key],
      );
    });

    it(`tier ${tier}: staking_multiplier_bps matches`, () => {
      expect(TIER_BENEFITS[tier].staking_multiplier_bps).toBe(
        spec.staking_multiplier_bps[key],
      );
    });

    it(`tier ${tier}: lp_yield_multiplier_bps matches`, () => {
      expect(TIER_BENEFITS[tier].lp_yield_multiplier_bps).toBe(
        spec.lp_yield_multiplier_bps[key],
      );
    });

    it(`tier ${tier}: inference_subsidy_bps matches`, () => {
      expect(TIER_BENEFITS[tier].inference_subsidy_bps).toBe(
        spec.inference_subsidy_bps[key],
      );
    });

    it(`tier ${tier}: gostop_max_bet_usdc_micro matches Move max_bet_floor_usdc`, () => {
      expect(TIER_BENEFITS[tier].gostop_max_bet_usdc_micro).toBe(
        spec.max_bet_floor_usdc[key],
      );
    });

    it(`tier ${tier}: can_create_vault matches`, () => {
      expect(TIER_BENEFITS[tier].can_create_vault).toBe(
        spec.can_create_vault[key],
      );
    });
  }

  it('display USD derived consistently from micro-units', () => {
    for (const tier of tiers) {
      expect(TIER_BENEFITS[tier].gostop_max_bet_usd).toBe(
        TIER_BENEFITS[tier].gostop_max_bet_usdc_micro / 1_000_000,
      );
    }
  });
});
