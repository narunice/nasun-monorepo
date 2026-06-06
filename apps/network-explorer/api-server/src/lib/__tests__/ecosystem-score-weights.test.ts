/**
 * Week-gate for the ecosystem weekly_score rebalance (staking emission
 * multiplier + creator-post divisor).
 *
 * Run with:
 *   npx --no-install tsx --test apps/network-explorer/api-server/src/lib/__tests__/ecosystem-score-weights.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ecosystemScoreWeights,
  isRebalanced,
  SCORE_REBALANCE_START_MS,
  STAKING_WEIGHT_MULT,
  CREATOR_POST_DIVISOR,
} from "../ecosystem-score-weights.js";

describe("ecosystem score rebalance gate", () => {
  test("default cutoff is 2026-W24 Monday (2026-06-08 UTC)", () => {
    // Aligned with the W24 wheel+bet-volume cutover so the full leaderboard
    // reshaping lands in a single weekly cutover.
    assert.equal(SCORE_REBALANCE_START_MS, Date.UTC(2026, 5, 8));
  });

  test("calibrated defaults: staking 1.5x, creator divisor 4", () => {
    assert.equal(STAKING_WEIGHT_MULT, 1.5);
    assert.equal(CREATOR_POST_DIVISOR, 4);
  });

  test("legacy weights for weeks before the cutoff (historical immutability)", () => {
    // W23 (2026-06-01) — the in-progress week at ship time — and earlier must
    // recompute with legacy weights so settled/pre-cutoff leaderboards stay
    // byte-identical.
    for (const monday of [Date.UTC(2026, 5, 1), Date.UTC(2026, 4, 25)]) {
      assert.equal(isRebalanced(monday), false);
      const w = ecosystemScoreWeights(monday);
      assert.equal(w.stakingMult, 1.0);
      assert.equal(w.creatorDivisor, 5);
    }
  });

  test("rebalanced weights at and after the cutoff", () => {
    // W24 (2026-06-08, the cutoff Monday) and later.
    for (const monday of [Date.UTC(2026, 5, 8), Date.UTC(2026, 5, 15)]) {
      assert.equal(isRebalanced(monday), true);
      const w = ecosystemScoreWeights(monday);
      assert.equal(w.stakingMult, STAKING_WEIGHT_MULT);
      assert.equal(w.creatorDivisor, CREATOR_POST_DIVISOR);
    }
  });
});
