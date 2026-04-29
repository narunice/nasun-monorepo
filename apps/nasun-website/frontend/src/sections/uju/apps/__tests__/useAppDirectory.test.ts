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

  it("filters explicitPinned to known app ids only", () => {
    const result = parseDirectoryState({
      explicitPinned: ["pado", "unknown-app", "jupiter", 42],
      missions: {},
    });
    expect(result.explicitPinned).toEqual(["pado", "jupiter"]);
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

  it("filters non-string mission ids but keeps stale-but-typed ids (registry intersection deferred)", () => {
    const result = parseDirectoryState({
      explicitPinned: [],
      missions: {
        pado: ["pado-dex", 42, null, "stale-mission-from-old-version"],
      },
    });
    // Type filter only — stale ids removed at render time, not parse time.
    expect(result.missions.pado).toEqual(["pado-dex", "stale-mission-from-old-version"]);
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
  it("returns empty state when neither key is present", () => {
    expect(loadFromStorage(ID_A)).toEqual({ explicitPinned: [], missions: {} });
  });

  it("loads new key when present", () => {
    const state: AppDirectoryState = {
      explicitPinned: ["pado"],
      missions: { pado: ["pado-dex"] },
    };
    store[NEW_KEY_A] = JSON.stringify(state);
    expect(loadFromStorage(ID_A)).toEqual(state);
  });

  it("migrates legacy key to new shape and writes new key", () => {
    store[OLD_KEY_A] = JSON.stringify(["pado", "jupiter"]);
    const result = loadFromStorage(ID_A);
    expect(result).toEqual({
      explicitPinned: ["pado", "jupiter"],
      missions: {},
    });
    // New key written
    expect(JSON.parse(store[NEW_KEY_A])).toEqual({
      explicitPinned: ["pado", "jupiter"],
      missions: {},
    });
    // Old key preserved (rollback safety)
    expect(store[OLD_KEY_A]).toBeDefined();
  });

  it("prefers new key when both old and new exist", () => {
    store[OLD_KEY_A] = JSON.stringify(["jupiter"]);
    store[NEW_KEY_A] = JSON.stringify({
      explicitPinned: ["pado"],
      missions: { pado: ["pado-dex"] },
    });
    const result = loadFromStorage(ID_A);
    expect(result.explicitPinned).toEqual(["pado"]);
    expect(result.missions).toEqual({ pado: ["pado-dex"] });
  });

  it("filters legacy key entries through VALID_APP_IDS", () => {
    store[OLD_KEY_A] = JSON.stringify(["pado", "ghost-app", "jupiter"]);
    const result = loadFromStorage(ID_A);
    expect(result.explicitPinned).toEqual(["pado", "jupiter"]);
  });

  it("uses guest key when identityId is undefined", () => {
    store["uju:pinned-apps:guest"] = JSON.stringify(["pado"]);
    const result = loadFromStorage(undefined);
    expect(result.explicitPinned).toEqual(["pado"]);
    expect(store["uju:app-directory:guest"]).toBeDefined();
  });
});

describe("effectivePinned (derive)", () => {
  it("merges explicitPinned with apps having selected missions", () => {
    const state: AppDirectoryState = {
      explicitPinned: ["pado"],
      missions: { jupiter: ["jupiter-swap"] },
    };
    expect(effectivePinned(state)).toEqual(["pado", "jupiter"]);
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
      missions: { jupiter: [] },
    };
    // jupiter has missions=[], not explicit → not effective
    expect(effectivePinned(state)).toEqual(["pado"]);
  });

  it("returns ids in APP_REGISTRY declaration order (deterministic)", () => {
    // pado precedes jupiter in registry; toggle insertion order should not matter
    const state: AppDirectoryState = {
      explicitPinned: ["jupiter"],
      missions: { pado: ["pado-dex"] },
    };
    expect(effectivePinned(state)).toEqual(["pado", "jupiter"]);
  });

  it("excludes apps not in registry", () => {
    const state: AppDirectoryState = {
      explicitPinned: ["pado", "ghost-app" as string],
      missions: {},
    };
    expect(effectivePinned(state)).toEqual(["pado"]);
  });
});
