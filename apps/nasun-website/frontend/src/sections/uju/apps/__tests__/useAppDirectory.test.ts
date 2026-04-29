// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() {
    return Object.keys(store).length;
  },
};
vi.stubGlobal("localStorage", localStorageMock);

import {
  parseDirectoryState,
  loadFromStorage,
  effectivePinned,
  selectedMissionCount,
  type AppDirectoryState,
} from "../useAppDirectory";

const ID_A = "ap-northeast-2:aaaa";
const NEW_KEY_A = `uju:app-directory:${ID_A}`;
const OLD_KEY_A = `uju:pinned-apps:${ID_A}`;

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
});

describe("parseDirectoryState", () => {
  it("returns empty state for null/undefined/non-object", () => {
    expect(parseDirectoryState(null)).toEqual({ explicitPinned: [], missions: {} });
    expect(parseDirectoryState(undefined)).toEqual({ explicitPinned: [], missions: {} });
    expect(parseDirectoryState("garbage")).toEqual({ explicitPinned: [], missions: {} });
    expect(parseDirectoryState(42)).toEqual({ explicitPinned: [], missions: {} });
  });

  it("filters explicitPinned to known app ids only (drops removed apps)", () => {
    const result = parseDirectoryState({
      explicitPinned: ["pado", "unknown-app", "jupiter", "cetus", "uniswap", 42],
      missions: {},
    });
    // jupiter/cetus/uniswap removed from registry in PR3b
    expect(result.explicitPinned).toEqual(["pado"]);
  });

  it("drops unknown appId keys from missions", () => {
    const result = parseDirectoryState({
      explicitPinned: [],
      missions: {
        pado: ["pado-dex"],
        "unknown-app": ["something"],
      },
    });
    expect(result.missions).toEqual({ pado: ["pado-dex"] });
  });

  it("drops STALE mission ids (chat/jupiter-swap/cetus-trade/uniswap-swap)", () => {
    const result = parseDirectoryState({
      explicitPinned: [],
      missions: {
        pado: ["pado-dex", "chat", "jupiter-swap"],
        "nasun-devnet": ["faucet", "wallet-transfer", "cetus-trade", "uniswap-swap"],
      },
    });
    expect(result.missions.pado).toEqual(["pado-dex"]);
    expect(result.missions["nasun-devnet"]).toEqual(["faucet", "wallet-transfer"]);
  });

  it("filters non-string mission ids but keeps unknown-but-typed ids (registry intersection deferred)", () => {
    const result = parseDirectoryState({
      explicitPinned: [],
      missions: {
        pado: ["pado-dex", 42, null, "future-unknown-mission"],
      },
    });
    expect(result.missions.pado).toEqual(["pado-dex", "future-unknown-mission"]);
  });

  it("ignores non-array mission values", () => {
    const result = parseDirectoryState({
      explicitPinned: [],
      missions: { pado: "not-an-array" },
    });
    expect(result.missions).toEqual({});
  });
});

describe("loadFromStorage migration", () => {
  it("seeds DEFAULT_PINNED_APPS + DEFAULT_MISSIONS_BY_APP for fresh user (no key present)", () => {
    const result = loadFromStorage(ID_A);
    expect(result.explicitPinned).toEqual(["nasun-devnet", "pado", "gostop"]);
    expect(result.missions).toEqual({
      "nasun-devnet": ["faucet", "wallet-transfer"],
      pado: ["pado-dex"],
      gostop: ["gostop-lottery", "gostop-scratchcard", "gostop-numbermatch"],
    });
  });

  it("seeds exactly 6 missions (under 7-cap, leaves room for mines/crash opt-in)", () => {
    const result = loadFromStorage(ID_A);
    const total = Object.values(result.missions).reduce((n, ids) => n + ids.length, 0);
    expect(total).toBe(6);
  });

  it("does NOT persist the seed (so deactivate-then-reload stays empty)", () => {
    loadFromStorage(ID_A);
    expect(store[NEW_KEY_A]).toBeUndefined();
  });

  it("on first load, merges existing new-key state with v6 defaults and persists", () => {
    const state: AppDirectoryState = {
      explicitPinned: [],
      missions: {},
    };
    store[NEW_KEY_A] = JSON.stringify(state);
    const result = loadFromStorage(ID_A);
    expect(result.explicitPinned).toEqual(["nasun-devnet", "pado", "gostop"]);
    expect(result.missions["nasun-devnet"]).toEqual(["faucet", "wallet-transfer"]);
    expect(result.missions.pado).toEqual(["pado-dex"]);
    expect(result.missions.gostop).toEqual([
      "gostop-lottery",
      "gostop-scratchcard",
      "gostop-numbermatch",
    ]);
    // Persisted to new key
    expect(JSON.parse(store[NEW_KEY_A])).toEqual(result);
    // Migration flag set
    expect(store[`uju:app-directory:migrated-v6-defaults:${ID_A}`]).toBe("1");
  });

  it("on second load (already migrated), returns user-authored state untouched", () => {
    store[NEW_KEY_A] = JSON.stringify({ explicitPinned: ["gostop"], missions: { gostop: ["gostop-crash"] } });
    store[`uju:app-directory:migrated-v6-defaults:${ID_A}`] = "1";
    const result = loadFromStorage(ID_A);
    expect(result).toEqual({ explicitPinned: ["gostop"], missions: { gostop: ["gostop-crash"] } });
  });

  it("migration preserves user's prior selections (e.g. gostop-crash kept alongside defaults)", () => {
    store[NEW_KEY_A] = JSON.stringify({
      explicitPinned: ["gostop"],
      missions: { gostop: ["gostop-crash"] },
    });
    const result = loadFromStorage(ID_A);
    expect(result.missions.gostop).toEqual([
      "gostop-crash",
      "gostop-lottery",
      "gostop-scratchcard",
      "gostop-numbermatch",
    ]);
    // Total = 0 (nasun-devnet seeded 2) + (pado seeded 1) + (4 gostop) = 7
    const total = Object.values(result.missions).reduce((n, ids) => n + ids.length, 0);
    expect(total).toBe(7);
  });

  it("migration clamps to 7-cap (existing > cap unchanged, no defaults added)", () => {
    // User had 7 gostop missions before (all 5 + something hypothetical)
    store[NEW_KEY_A] = JSON.stringify({
      explicitPinned: ["gostop"],
      missions: {
        gostop: ["gostop-lottery", "gostop-scratchcard", "gostop-numbermatch", "gostop-mines", "gostop-crash"],
        pado: ["pado-dex"],
        "nasun-devnet": ["faucet"],
      },
    });
    const result = loadFromStorage(ID_A);
    const total = Object.values(result.missions).reduce((n, ids) => n + ids.length, 0);
    expect(total).toBe(7); // existing 7, no addition possible
    // Existing selections preserved
    expect(result.missions.gostop).toContain("gostop-crash");
    expect(result.missions["nasun-devnet"]).toEqual(["faucet"]);
  });

  it("migrates legacy key + applies v6 defaults", () => {
    store[OLD_KEY_A] = JSON.stringify(["pado"]);
    const result = loadFromStorage(ID_A);
    expect(result.explicitPinned).toContain("pado");
    expect(result.explicitPinned).toContain("nasun-devnet");
    expect(result.explicitPinned).toContain("gostop");
    expect(result.missions.pado).toEqual(["pado-dex"]);
    // Old key preserved
    expect(store[OLD_KEY_A]).toBeDefined();
  });

  it("prefers new key when both old and new exist (legacy ignored)", () => {
    store[OLD_KEY_A] = JSON.stringify(["pado"]);
    store[NEW_KEY_A] = JSON.stringify({
      explicitPinned: ["gostop"],
      missions: { gostop: ["gostop-crash"] },
    });
    const result = loadFromStorage(ID_A);
    expect(result.missions.gostop).toContain("gostop-crash");
  });

  it("filters legacy key entries through VALID_APP_IDS before merge (drops removed apps)", () => {
    store[OLD_KEY_A] = JSON.stringify(["jupiter", "ghost"]);
    const result = loadFromStorage(ID_A);
    // jupiter/ghost dropped, but defaults still added
    expect(result.explicitPinned).not.toContain("jupiter");
    expect(result.explicitPinned).not.toContain("ghost");
    expect(result.explicitPinned).toEqual(["nasun-devnet", "pado", "gostop"]);
  });
});

describe("effectivePinned (derive)", () => {
  it("merges explicitPinned with apps having selected missions", () => {
    const state: AppDirectoryState = {
      explicitPinned: ["pado"],
      missions: { gostop: ["gostop-crash"] },
    };
    expect(effectivePinned(state)).toEqual(["pado", "gostop"]);
  });

  it("dedupes when an app appears in both explicitPinned and missions", () => {
    const state: AppDirectoryState = {
      explicitPinned: ["pado"],
      missions: { pado: ["pado-dex"] },
    };
    expect(effectivePinned(state)).toEqual(["pado"]);
  });

  it("excludes apps with empty missions array unless explicit", () => {
    const state: AppDirectoryState = {
      explicitPinned: ["pado"],
      missions: { gostop: [] },
    };
    expect(effectivePinned(state)).toEqual(["pado"]);
  });

  it("returns ids in APP_REGISTRY declaration order (deterministic)", () => {
    // nasun-devnet precedes pado in registry
    const state: AppDirectoryState = {
      explicitPinned: ["pado"],
      missions: { "nasun-devnet": ["faucet"] },
    };
    expect(effectivePinned(state)).toEqual(["nasun-devnet", "pado"]);
  });
});

describe("selectedMissionCount", () => {
  it("counts only mission ids defined in APP_MISSION_MAP", () => {
    const state: AppDirectoryState = {
      explicitPinned: [],
      missions: {
        "nasun-devnet": ["faucet", "wallet-transfer"],
        pado: ["pado-dex", "ghost-mission"],
      },
    };
    expect(selectedMissionCount(state)).toBe(3);
  });

  it("returns 0 for empty state", () => {
    expect(selectedMissionCount({ explicitPinned: [], missions: {} })).toBe(0);
  });

  it("ignores apps removed from registry", () => {
    const state: AppDirectoryState = {
      explicitPinned: [],
      missions: {
        jupiter: ["jupiter-swap"],
        pado: ["pado-dex"],
      },
    };
    expect(selectedMissionCount(state)).toBe(1);
  });
});
