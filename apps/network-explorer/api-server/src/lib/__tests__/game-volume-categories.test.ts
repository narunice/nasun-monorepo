/**
 * gostop-wheel week-gate for the ecosystem weekly volume_count.
 *
 * Run with:
 *   npx --no-install tsx --test apps/network-explorer/api-server/src/lib/__tests__/game-volume-categories.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  includeWheelVolume,
  WHEEL_VOLUME_START_MS,
} from "../game-volume-categories.js";

describe("gostop-wheel volume gate", () => {
  test("default cutoff is 2026-W24 Monday (2026-06-08 UTC)", () => {
    assert.equal(WHEEL_VOLUME_START_MS, Date.UTC(2026, 5, 8));
  });

  test("excludes wheel for weeks before the cutoff (historical immutability)", () => {
    // W23 (2026-06-01) — the in-progress week at ship time; wheel must NOT count
    // so past/current recomputes stay identical to what was settled.
    assert.equal(includeWheelVolume(Date.UTC(2026, 5, 1)), false);
    // Any earlier week.
    assert.equal(includeWheelVolume(Date.UTC(2026, 4, 25)), false);
  });

  test("includes wheel at and after the cutoff", () => {
    // Exactly the cutoff Monday.
    assert.equal(includeWheelVolume(Date.UTC(2026, 5, 8)), true);
    // A later week.
    assert.equal(includeWheelVolume(Date.UTC(2026, 5, 15)), true);
  });
});
