// @vitest-environment node
import { describe, it, expect } from "vitest";
import { SOL_LSTS } from "../useSolLst";

// Frozen snapshot of LST mint addresses. Silent edits change which token's
// balance we read — locking these prevents drift.
describe("SOL LST mint addresses (frozen snapshot)", () => {
  it("mSOL (Marinade)", () => {
    expect(SOL_LSTS[0]).toEqual({
      symbol: "mSOL",
      mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    });
  });

  it("jitoSOL (Jito)", () => {
    expect(SOL_LSTS[1]).toEqual({
      symbol: "jitoSOL",
      mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    });
  });

  it("bSOL (Sanctum)", () => {
    expect(SOL_LSTS[2]).toEqual({
      symbol: "bSOL",
      mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    });
  });

  it("has exactly 3 LSTs (v5 scope)", () => {
    expect(SOL_LSTS.length).toBe(3);
  });
});
