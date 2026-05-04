import { describe, it, expect } from "vitest";
import { buildSlides } from "../../NewsEventsCard";
import type { BonusFeedEntry } from "@/services/ecosystemScoreApi";

function makeEntry(id: string): BonusFeedEntry {
  return {
    id,
    category: "ecosystem-bonus-leaderboard",
    points: 100,
    awardedAt: new Date().toISOString(),
    metadata: {},
  };
}

describe("buildSlides", () => {
  it("0 bonuses -> Welcome + 3 pads (4 total)", () => {
    expect(buildSlides([], {}).map((s) => s.id)).toEqual([
      "onboarding:welcome",
      "onboarding:leaderboard",
      "onboarding:missions",
      "onboarding:bugreport",
    ]);
  });

  it("2 bonuses -> 2 bonus + leaderboard + missions (no Welcome, pads in order)", () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    expect(buildSlides(entries, {}).map((s) => s.id)).toEqual([
      "bonus:a",
      "bonus:b",
      "onboarding:leaderboard",
      "onboarding:missions",
    ]);
  });

  it("5 bonuses -> newest 4 only, no onboarding slides", () => {
    const entries = ["a", "b", "c", "d", "e"].map(makeEntry);
    expect(buildSlides(entries, {}).map((s) => s.id)).toEqual([
      "bonus:a",
      "bonus:b",
      "bonus:c",
      "bonus:d",
    ]);
  });
});
