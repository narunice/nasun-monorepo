// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

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

import { useSuiAddressStore, isValidSuiAddress } from "../suiAddressStore";

const ID_A = "ap-northeast-2:aaaa";
const ID_B = "ap-northeast-2:bbbb";
const VALID_SUI_A = "0x" + "a".repeat(64);
const VALID_SUI_B = "0x" + "b".repeat(64);

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  useSuiAddressStore.setState({ byIdentity: {} });
});

describe("isValidSuiAddress", () => {
  it("accepts 0x-prefixed 64-hex", () => {
    expect(isValidSuiAddress(VALID_SUI_A)).toBe(true);
  });
  it("rejects ETH-shape (40-hex)", () => {
    expect(isValidSuiAddress("0x" + "f".repeat(40))).toBe(false);
  });
  it("rejects bare hex without 0x", () => {
    expect(isValidSuiAddress("a".repeat(64))).toBe(false);
  });
  it("rejects too short", () => {
    expect(isValidSuiAddress("0xabcdef")).toBe(false);
  });
});

describe("setExternal", () => {
  it("stores valid address + persists to localStorage", () => {
    useSuiAddressStore.getState().setExternal(ID_A, VALID_SUI_A);
    expect(useSuiAddressStore.getState().byIdentity[ID_A]).toEqual({
      externalAddress: VALID_SUI_A,
    });
    expect(store[`uju:sui-external-address:${ID_A}`]).toBe(VALID_SUI_A);
  });

  it("clearing (null) removes localStorage key", () => {
    useSuiAddressStore.getState().setExternal(ID_A, VALID_SUI_A);
    useSuiAddressStore.getState().setExternal(ID_A, null);
    expect(useSuiAddressStore.getState().byIdentity[ID_A]).toEqual({
      externalAddress: null,
    });
    expect(store[`uju:sui-external-address:${ID_A}`]).toBeUndefined();
  });

  it("rejects invalid address with throw", () => {
    expect(() =>
      useSuiAddressStore.getState().setExternal(ID_A, "not-a-sui"),
    ).toThrow(/Invalid SUI address/);
    expect(useSuiAddressStore.getState().byIdentity[ID_A]).toBeUndefined();
  });

  it("isolates state per identityId", () => {
    useSuiAddressStore.getState().setExternal(ID_A, VALID_SUI_A);
    useSuiAddressStore.getState().setExternal(ID_B, VALID_SUI_B);
    expect(useSuiAddressStore.getState().byIdentity[ID_A]?.externalAddress).toBe(VALID_SUI_A);
    expect(useSuiAddressStore.getState().byIdentity[ID_B]?.externalAddress).toBe(VALID_SUI_B);
  });
});

describe("hydrateFromStorage", () => {
  it("loads persisted address", () => {
    store[`uju:sui-external-address:${ID_A}`] = VALID_SUI_A;
    useSuiAddressStore.getState().hydrateFromStorage(ID_A);
    expect(useSuiAddressStore.getState().byIdentity[ID_A]?.externalAddress).toBe(VALID_SUI_A);
  });

  it("ignores invalid persisted address (defensive)", () => {
    store[`uju:sui-external-address:${ID_A}`] = "garbage";
    useSuiAddressStore.getState().hydrateFromStorage(ID_A);
    expect(useSuiAddressStore.getState().byIdentity[ID_A]).toBeUndefined();
  });

  it("identity switch: hydrating B does not clobber A", () => {
    useSuiAddressStore.getState().setExternal(ID_A, VALID_SUI_A);
    store[`uju:sui-external-address:${ID_B}`] = VALID_SUI_B;
    useSuiAddressStore.getState().hydrateFromStorage(ID_B);
    expect(useSuiAddressStore.getState().byIdentity[ID_A]?.externalAddress).toBe(VALID_SUI_A);
    expect(useSuiAddressStore.getState().byIdentity[ID_B]?.externalAddress).toBe(VALID_SUI_B);
  });
});
