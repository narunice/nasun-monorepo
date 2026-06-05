/**
 * Ecosystem volume term: bet-volume gate + calibrated constants.
 *
 * Run with:
 *   npx --no-install tsx --test apps/network-explorer/api-server/src/lib/__tests__/ecosystem-volume-score.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  includeBetVolume,
  GAME_VOLUME_START_MS,
  GAME_VOLUME_COEFF,
  GAME_VOLUME_MAX,
} from "../ecosystem-volume-score.js";

describe("ecosystem bet-volume gate", () => {
  test("default cutoff is 2026-W24 Monday (2026-06-08 UTC), aligned with wheel gate", () => {
    assert.equal(GAME_VOLUME_START_MS, Date.UTC(2026, 5, 8));
  });

  test("weight-neutral calibrated constants (coeff 0.5, max 6)", () => {
    assert.equal(GAME_VOLUME_COEFF, 0.5);
    assert.equal(GAME_VOLUME_MAX, 6);
  });

  test("legacy count term for weeks before the cutoff (historical immutability)", () => {
    // W23 (2026-06-01) — in-progress week at ship time: keep the legacy count
    // formula so past/current recomputes are unchanged.
    assert.equal(includeBetVolume(Date.UTC(2026, 5, 1)), false);
    assert.equal(includeBetVolume(Date.UTC(2026, 4, 25)), false);
  });

  test("bet volume at and after the cutoff", () => {
    assert.equal(includeBetVolume(Date.UTC(2026, 5, 8)), true);
    assert.equal(includeBetVolume(Date.UTC(2026, 5, 15)), true);
  });
});
