// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  STETH_ADDRESS,
  WSTETH_ADDRESS,
  formatEthLstTotal,
  wstethToSteth,
} from "../useEthLst";

// Frozen address snapshot — silent edits change which token's balance we read.
describe("ETH LST addresses (frozen)", () => {
  it("stETH (Lido)", () => {
    expect(STETH_ADDRESS).toBe("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84");
  });

  it("wstETH (Lido wrapped)", () => {
    expect(WSTETH_ADDRESS).toBe("0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0");
  });
});

describe("wstethToSteth ratio math", () => {
  const E18 = 1_000_000_000_000_000_000n;

  it("1 wstETH at ratio 1.18 returns ~1.18 stETH", () => {
    const ratio = (118n * E18) / 100n; // 1.18e18
    const out = wstethToSteth(E18, ratio); // 1 wstETH
    expect(out).toBe(ratio);
  });

  it("0 wstETH returns 0 regardless of ratio", () => {
    const ratio = (118n * E18) / 100n;
    expect(wstethToSteth(0n, ratio)).toBe(0n);
  });

  it("0 ratio returns 0 (degenerate)", () => {
    expect(wstethToSteth(E18, 0n)).toBe(0n);
  });

  it("preserves precision with large ratio (1.18e18 exact)", () => {
    const ratio = 1_180_000_000_000_000_000n;
    const wsteth = 5_000_000_000_000_000_000n; // 5 wstETH
    expect(wstethToSteth(wsteth, ratio)).toBe(5_900_000_000_000_000_000n); // 5.9 stETH
  });
});

describe("formatEthLstTotal", () => {
  const E18 = 1_000_000_000_000_000_000n;

  it("0 returns '0 stETH'", () => {
    expect(formatEthLstTotal(0n)).toBe("0 stETH");
  });

  it("1.234567 truncates to 4 decimals", () => {
    const v = 1_234_567_000_000_000_000n;
    expect(formatEthLstTotal(v)).toBe("≈ 1.2345 stETH");
  });

  it("integer value drops decimals", () => {
    expect(formatEthLstTotal(2n * E18)).toBe("≈ 2 stETH");
  });

  it("trailing zeros dropped from fractional", () => {
    // 1.5 stETH
    const v = 1_500_000_000_000_000_000n;
    expect(formatEthLstTotal(v)).toBe("≈ 1.5 stETH");
  });
});
