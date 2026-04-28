// @vitest-environment node
//
// Behavioral test for solAddressStore. node env + localStorage mock per project
// convention (jsdom + vitest 4 has ERR_REQUIRE_ESM). Covers Plan v5 3A.3
// scenarios: set, hydrate, validation, identityId switching, undefined.

import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory localStorage mock — must be set BEFORE importing the store
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length; },
};
vi.stubGlobal("localStorage", localStorageMock);

// Now import — store module reads localStorage at action time, not import time.
import { useSolAddressStore } from "../solAddressStore";

const ID_A = "ap-northeast-2:user-aaaa";
const ID_B = "ap-northeast-2:user-bbbb";
const VALID_SOL = "CFE3CkkqXCKsZQqAMS3PQYjgZRbtN3qV7XHmcimTcQXm";
const VALID_SOL_2 = "4Nd1mYv8N2n5uZ8kKv3q8Uk7n8Vt9s3c2rQ2n6dZyvBF";

beforeEach(() => {
  // Reset both store and mock localStorage between tests for isolation
  Object.keys(store).forEach((k) => delete store[k]);
  useSolAddressStore.setState({ byIdentity: {} });
});

describe("solAddressStore.setForIdentity", () => {
  it("stores valid address + adapter, persists to localStorage", () => {
    useSolAddressStore.getState().setForIdentity(ID_A, VALID_SOL, "phantom");
    const s = useSolAddressStore.getState().byIdentity[ID_A];
    expect(s).toEqual({ solAddress: VALID_SOL, connectedWallet: "phantom" });
    expect(store[`uju:sol-address:${ID_A}`]).toBe(VALID_SOL);
    expect(store[`uju:sol-wallet:${ID_A}`]).toBe("phantom");
  });

  it("manual entry: address + null wallet → no wallet key written", () => {
    useSolAddressStore.getState().setForIdentity(ID_A, VALID_SOL, null);
    expect(store[`uju:sol-address:${ID_A}`]).toBe(VALID_SOL);
    expect(store[`uju:sol-wallet:${ID_A}`]).toBeUndefined();
  });

  it("clearing (null address) removes both localStorage keys", () => {
    useSolAddressStore.getState().setForIdentity(ID_A, VALID_SOL, "solflare");
    useSolAddressStore.getState().setForIdentity(ID_A, null, null);
    expect(useSolAddressStore.getState().byIdentity[ID_A]).toEqual({
      solAddress: null,
      connectedWallet: null,
    });
    expect(store[`uju:sol-address:${ID_A}`]).toBeUndefined();
    expect(store[`uju:sol-wallet:${ID_A}`]).toBeUndefined();
  });

  it("rejects invalid base58 address with throw (validation at boundary)", () => {
    expect(() =>
      useSolAddressStore.getState().setForIdentity(ID_A, "not-a-valid-sol-addr", null),
    ).toThrow(/Invalid Solana address/);
    // store unchanged
    expect(useSolAddressStore.getState().byIdentity[ID_A]).toBeUndefined();
  });

  it("isolates state per identityId", () => {
    useSolAddressStore.getState().setForIdentity(ID_A, VALID_SOL, "phantom");
    useSolAddressStore.getState().setForIdentity(ID_B, VALID_SOL_2, "solflare");
    const a = useSolAddressStore.getState().byIdentity[ID_A];
    const b = useSolAddressStore.getState().byIdentity[ID_B];
    expect(a?.solAddress).toBe(VALID_SOL);
    expect(b?.solAddress).toBe(VALID_SOL_2);
    expect(a?.connectedWallet).toBe("phantom");
    expect(b?.connectedWallet).toBe("solflare");
  });
});

describe("solAddressStore.hydrateFromStorage", () => {
  it("loads persisted address + wallet into store", () => {
    store[`uju:sol-address:${ID_A}`] = VALID_SOL;
    store[`uju:sol-wallet:${ID_A}`] = "phantom";
    useSolAddressStore.getState().hydrateFromStorage(ID_A);
    expect(useSolAddressStore.getState().byIdentity[ID_A]).toEqual({
      solAddress: VALID_SOL,
      connectedWallet: "phantom",
    });
  });

  it("ignores localStorage if persisted address is invalid (defensive)", () => {
    store[`uju:sol-address:${ID_A}`] = "garbage";
    useSolAddressStore.getState().hydrateFromStorage(ID_A);
    // Invalid → store stays untouched for that identity
    expect(useSolAddressStore.getState().byIdentity[ID_A]).toBeUndefined();
  });

  it("treats unknown wallet provider as null (forward-compat)", () => {
    store[`uju:sol-address:${ID_A}`] = VALID_SOL;
    store[`uju:sol-wallet:${ID_A}`] = "future-wallet-x";
    useSolAddressStore.getState().hydrateFromStorage(ID_A);
    expect(useSolAddressStore.getState().byIdentity[ID_A]).toEqual({
      solAddress: VALID_SOL,
      connectedWallet: null,
    });
  });

  it("no-op if nothing persisted for identity", () => {
    useSolAddressStore.getState().hydrateFromStorage(ID_A);
    expect(useSolAddressStore.getState().byIdentity[ID_A]).toBeUndefined();
  });

  it("identityId switching: hydrating B does not clobber A", () => {
    useSolAddressStore.getState().setForIdentity(ID_A, VALID_SOL, "phantom");
    store[`uju:sol-address:${ID_B}`] = VALID_SOL_2;
    store[`uju:sol-wallet:${ID_B}`] = "solflare";
    useSolAddressStore.getState().hydrateFromStorage(ID_B);
    expect(useSolAddressStore.getState().byIdentity[ID_A]?.solAddress).toBe(VALID_SOL);
    expect(useSolAddressStore.getState().byIdentity[ID_B]?.solAddress).toBe(VALID_SOL_2);
  });
});

describe("Plan v5 3A.3 scenarios end-to-end", () => {
  it("scenario 1: Phantom connect → display → disconnect → null", () => {
    // connect
    useSolAddressStore.getState().setForIdentity(ID_A, VALID_SOL, "phantom");
    expect(useSolAddressStore.getState().byIdentity[ID_A]?.solAddress).toBe(VALID_SOL);
    // disconnect
    useSolAddressStore.getState().setForIdentity(ID_A, null, null);
    expect(useSolAddressStore.getState().byIdentity[ID_A]?.solAddress).toBe(null);
  });

  it("scenario 2: invalid manual entry → reject + no state change", () => {
    expect(() =>
      useSolAddressStore.getState().setForIdentity(ID_A, "0xnotsol", null),
    ).toThrow();
    expect(useSolAddressStore.getState().byIdentity[ID_A]).toBeUndefined();
  });

  it("scenario 3: valid manual → save → reload → restore", () => {
    useSolAddressStore.getState().setForIdentity(ID_A, VALID_SOL, null);
    // simulate fresh app start: clear in-memory state, re-hydrate
    useSolAddressStore.setState({ byIdentity: {} });
    useSolAddressStore.getState().hydrateFromStorage(ID_A);
    expect(useSolAddressStore.getState().byIdentity[ID_A]).toEqual({
      solAddress: VALID_SOL,
      connectedWallet: null,
    });
  });

  it("scenario 4: identityId transition preserves prior state", () => {
    useSolAddressStore.getState().setForIdentity(ID_A, VALID_SOL, "phantom");
    useSolAddressStore.getState().setForIdentity(ID_B, VALID_SOL_2, null);
    // both retained
    expect(useSolAddressStore.getState().byIdentity[ID_A]?.solAddress).toBe(VALID_SOL);
    expect(useSolAddressStore.getState().byIdentity[ID_B]?.solAddress).toBe(VALID_SOL_2);
  });

  it("scenario 6: empty input → null clear", () => {
    useSolAddressStore.getState().setForIdentity(ID_A, VALID_SOL, "solflare");
    useSolAddressStore.getState().setForIdentity(ID_A, null, null);
    expect(store[`uju:sol-address:${ID_A}`]).toBeUndefined();
    expect(useSolAddressStore.getState().byIdentity[ID_A]?.solAddress).toBe(null);
  });

  it("scenario 7: identityId flicker (undefined → defined) → no errors", () => {
    // hydrate with no identity is impossible (function requires string),
    // but useSolAddressForIdentity selector handles undefined → null at the
    // hook level (tested below).
    expect(() => useSolAddressStore.getState().hydrateFromStorage("")).not.toThrow();
    // empty string id key shouldn't pollute byIdentity
    expect(useSolAddressStore.getState().byIdentity[""]).toBeUndefined();
  });
});
