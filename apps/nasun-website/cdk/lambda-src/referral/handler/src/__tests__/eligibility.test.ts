/**
 * Eligibility gate — pure logic test suite.
 *
 * Run with:
 *   npx --no-install tsx --test apps/nasun-website/cdk/lambda-src/referral/handler/src/__tests__/eligibility.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateGate,
  hasX,
  hasGoogle,
  hasTelegram,
  type EligibilitySignals,
} from "../eligibility.js";

const baseSignals: EligibilitySignals = {
  hasGovernanceVote: false,
  hasGenesisPass: false,
  adminCuratedBonusTotal: 0,
  activationsCacheReady: true,
};

describe("hasX / hasGoogle / hasTelegram", () => {
  test("hasX detects twitterHandle", () => {
    assert.equal(hasX({ twitterHandle: "alice" }), true);
    assert.equal(hasX({ twitterHandle: "" }), false);
    assert.equal(hasX(undefined), false);
    assert.equal(hasX({}), false);
  });

  test("hasGoogle detects primary provider", () => {
    assert.equal(hasGoogle({ provider: "google" }), true);
    assert.equal(hasGoogle({ provider: "twitter" }), false);
  });

  test("hasGoogle detects linkedAccounts.google", () => {
    assert.equal(
      hasGoogle({ linkedAccounts: { google: { identityId: "abc" } } }),
      true,
    );
    assert.equal(hasGoogle({ linkedAccounts: { google: {} } }), false);
    assert.equal(hasGoogle({ linkedAccounts: {} }), false);
    assert.equal(hasGoogle(undefined), false);
  });

  test("hasTelegram requires strict true", () => {
    assert.equal(hasTelegram({ isTelegramMember: true }), true);
    assert.equal(hasTelegram({ isTelegramMember: "true" as any }), false);
    assert.equal(hasTelegram({ isTelegramMember: false }), false);
    assert.equal(hasTelegram(undefined), false);
  });
});

describe("evaluateGate — eligible paths", () => {
  test("P1: governance vote alone qualifies", () => {
    const r = evaluateGate(undefined, { ...baseSignals, hasGovernanceVote: true });
    assert.equal(r.eligible, true);
    assert.equal(r.passedPath, "p1-governance");
  });

  test("P2: Genesis Pass alone qualifies", () => {
    const r = evaluateGate(undefined, { ...baseSignals, hasGenesisPass: true });
    assert.equal(r.eligible, true);
    assert.equal(r.passedPath, "p2-genesis-pass");
  });

  test("P3: admin bonus >= 40 alone qualifies", () => {
    const r = evaluateGate(undefined, {
      ...baseSignals,
      adminCuratedBonusTotal: 40,
    });
    assert.equal(r.eligible, true);
    assert.equal(r.passedPath, "p3-admin-bonus");
  });

  test("P3: admin bonus >> 40 still qualifies via P3", () => {
    const r = evaluateGate(undefined, {
      ...baseSignals,
      adminCuratedBonusTotal: 100,
    });
    assert.equal(r.passedPath, "p3-admin-bonus");
  });

  test("P4: triple social + 25pt qualifies", () => {
    const profile = {
      twitterHandle: "alice",
      provider: "google",
      isTelegramMember: true,
    };
    const r = evaluateGate(profile, {
      ...baseSignals,
      adminCuratedBonusTotal: 25,
    });
    assert.equal(r.eligible, true);
    assert.equal(r.passedPath, "p4-triple-social");
  });

  test("P4: triple social + exactly 25pt boundary", () => {
    const profile = {
      twitterHandle: "alice",
      linkedAccounts: { google: { identityId: "x" } },
      isTelegramMember: true,
    };
    const r = evaluateGate(profile, {
      ...baseSignals,
      adminCuratedBonusTotal: 25,
    });
    assert.equal(r.eligible, true);
    assert.equal(r.passedPath, "p4-triple-social");
  });

  test("P1 wins over later paths when multiple signals present", () => {
    const profile = {
      twitterHandle: "alice",
      provider: "google",
      isTelegramMember: true,
    };
    const r = evaluateGate(profile, {
      ...baseSignals,
      hasGovernanceVote: true,
      hasGenesisPass: true,
      adminCuratedBonusTotal: 100,
    });
    assert.equal(r.passedPath, "p1-governance");
  });
});

describe("evaluateGate — rejection + hint", () => {
  test("Empty profile + zero signals: hint points to P3", () => {
    const r = evaluateGate(undefined, baseSignals);
    assert.equal(r.eligible, false);
    assert.equal(r.closestPath, "p3-admin-bonus");
    assert.match(r.hint!, /40 total/);
  });

  test("Triple social but only 24pt: hint points to P4", () => {
    const profile = {
      twitterHandle: "alice",
      provider: "google",
      isTelegramMember: true,
    };
    const r = evaluateGate(profile, {
      ...baseSignals,
      adminCuratedBonusTotal: 24,
    });
    assert.equal(r.eligible, false);
    assert.equal(r.closestPath, "p4-triple-social");
    assert.match(r.hint!, /1 more/); // 25 - 24 = 1
  });

  test("Solo bonus 39pt (one short of P3) hints P3", () => {
    const r = evaluateGate(undefined, {
      ...baseSignals,
      adminCuratedBonusTotal: 39,
    });
    assert.equal(r.eligible, false);
    assert.equal(r.closestPath, "p3-admin-bonus");
    assert.match(r.hint!, /1 more/);
  });

  test("Two-of-three socials does NOT qualify P4 even with 25pt", () => {
    const profile = {
      twitterHandle: "alice",
      provider: "google",
      // missing isTelegramMember
    };
    const r = evaluateGate(profile, {
      ...baseSignals,
      adminCuratedBonusTotal: 25,
    });
    assert.equal(r.eligible, false);
  });
});
