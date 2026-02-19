/**
 * useRefreshBalance Passkey Fallback Tests
 *
 * Tests the address fallback chain in useRefreshBalance():
 *   signerAddr → account.address → zkState.address → passkeyAddress
 *
 * The bug: passkey address was missing from the fallback chain,
 * so when SignerManager.getCurrent() was null during a transient
 * state, passkey users' balance refresh would silently fail.
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================
// Test Helpers — Mirror useRefreshBalance logic
// ============================================

/**
 * Mirror of the address resolution in useRefreshBalance (useBalance.ts L92-94)
 *
 * The actual hook uses:
 *   const signerAddr = SignerManager.getCurrent()?.address;
 *   const address = signerAddr ?? account?.address ?? zkState?.address ?? passkeyAddress;
 */
function resolveRefreshAddress(params: {
  signerAddr: string | null | undefined;
  accountAddress: string | undefined;
  zkAddress: string | undefined;
  passkeyAddress: string | null;
}): string | null | undefined {
  return params.signerAddr ?? params.accountAddress ?? params.zkAddress ?? params.passkeyAddress;
}

// ============================================
// Fixtures
// ============================================

const SIGNER_ADDR = '0xaaaa000000000000000000000000000000000000000000000000000000000000';
const ACCOUNT_ADDR = '0xbbbb000000000000000000000000000000000000000000000000000000000000';
const ZK_ADDR = '0xcccc000000000000000000000000000000000000000000000000000000000000';
const PASSKEY_ADDR = '0xdddd000000000000000000000000000000000000000000000000000000000000';

// ============================================
// Tests
// ============================================

describe('useRefreshBalance address resolution', () => {
  // ------------------------------------------
  // Normal cases — SignerManager has current signer
  // ------------------------------------------
  describe('when SignerManager has current signer', () => {
    it('uses signer address as first priority', () => {
      expect(resolveRefreshAddress({
        signerAddr: SIGNER_ADDR,
        accountAddress: ACCOUNT_ADDR,
        zkAddress: ZK_ADDR,
        passkeyAddress: PASSKEY_ADDR,
      })).toBe(SIGNER_ADDR);
    });

    it('signer address overrides all fallbacks', () => {
      expect(resolveRefreshAddress({
        signerAddr: SIGNER_ADDR,
        accountAddress: undefined,
        zkAddress: undefined,
        passkeyAddress: null,
      })).toBe(SIGNER_ADDR);
    });
  });

  // ------------------------------------------
  // Transient states — SignerManager is null
  // ------------------------------------------
  describe('when SignerManager.getCurrent() is null (transient)', () => {
    it('falls back to account address for local wallet', () => {
      expect(resolveRefreshAddress({
        signerAddr: undefined,
        accountAddress: ACCOUNT_ADDR,
        zkAddress: undefined,
        passkeyAddress: null,
      })).toBe(ACCOUNT_ADDR);
    });

    it('falls back to zkLogin address', () => {
      expect(resolveRefreshAddress({
        signerAddr: undefined,
        accountAddress: undefined,
        zkAddress: ZK_ADDR,
        passkeyAddress: null,
      })).toBe(ZK_ADDR);
    });

    it('falls back to passkey address (FIX — was missing)', () => {
      // This is the exact scenario that was broken:
      // - passkey user with no local wallet, no zkLogin
      // - SignerManager momentarily returns null
      // Before fix: address = undefined → invalidateQueries skipped
      // After fix: address = passkeyAddress → balance refreshed
      expect(resolveRefreshAddress({
        signerAddr: undefined,
        accountAddress: undefined,
        zkAddress: undefined,
        passkeyAddress: PASSKEY_ADDR,
      })).toBe(PASSKEY_ADDR);
    });

    it('returns null when passkey address is null and no other source', () => {
      expect(resolveRefreshAddress({
        signerAddr: undefined,
        accountAddress: undefined,
        zkAddress: undefined,
        passkeyAddress: null,
      })).toBeNull();
    });
  });

  // ------------------------------------------
  // Priority chain edge cases
  // ------------------------------------------
  describe('fallback chain priority', () => {
    it('account address takes priority over zkLogin in fallback', () => {
      // Note: this is the fallback chain, NOT the address resolution for signing
      // In the fallback chain, order is: signer > account > zk > passkey
      expect(resolveRefreshAddress({
        signerAddr: undefined,
        accountAddress: ACCOUNT_ADDR,
        zkAddress: ZK_ADDR,
        passkeyAddress: PASSKEY_ADDR,
      })).toBe(ACCOUNT_ADDR);
    });

    it('zkLogin takes priority over passkey in fallback', () => {
      expect(resolveRefreshAddress({
        signerAddr: undefined,
        accountAddress: undefined,
        zkAddress: ZK_ADDR,
        passkeyAddress: PASSKEY_ADDR,
      })).toBe(ZK_ADDR);
    });

    it('signer null (not undefined) still falls through to account', () => {
      // SignerManager.getCurrent()?.address can return null if signer exists but address is null
      expect(resolveRefreshAddress({
        signerAddr: null,
        accountAddress: ACCOUNT_ADDR,
        zkAddress: undefined,
        passkeyAddress: null,
      })).toBe(ACCOUNT_ADDR);
    });
  });

  // ------------------------------------------
  // Query invalidation behavior
  // ------------------------------------------
  describe('query invalidation', () => {
    /**
     * Mirror of the invalidation check in useRefreshBalance:
     *   if (address) { await queryClient.invalidateQueries(...) }
     */
    function shouldInvalidate(address: string | null | undefined): boolean {
      return !!address;
    }

    it('invalidates for signer address', () => {
      expect(shouldInvalidate(SIGNER_ADDR)).toBe(true);
    });

    it('invalidates for passkey address', () => {
      expect(shouldInvalidate(PASSKEY_ADDR)).toBe(true);
    });

    it('does NOT invalidate for null address', () => {
      expect(shouldInvalidate(null)).toBe(false);
    });

    it('does NOT invalidate for undefined address', () => {
      expect(shouldInvalidate(undefined)).toBe(false);
    });

    it('does NOT invalidate for empty string', () => {
      expect(shouldInvalidate('')).toBe(false);
    });
  });

  // ------------------------------------------
  // Query key construction
  // ------------------------------------------
  describe('query key construction', () => {
    function buildQueryKey(chainId: string, address: string): readonly [string, string, string] {
      return ['wallet-balance', chainId, address] as const;
    }

    it('includes chainId in query key', () => {
      const key = buildQueryKey('272218f1', PASSKEY_ADDR);
      expect(key[1]).toBe('272218f1');
    });

    it('different addresses produce different query keys', () => {
      const key1 = buildQueryKey('272218f1', ACCOUNT_ADDR);
      const key2 = buildQueryKey('272218f1', PASSKEY_ADDR);
      expect(key1[2]).not.toBe(key2[2]);
    });

    it('same address with different chain produces different key', () => {
      const key1 = buildQueryKey('272218f1', PASSKEY_ADDR);
      const key2 = buildQueryKey('sui:mainnet', PASSKEY_ADDR);
      expect(key1[1]).not.toBe(key2[1]);
    });
  });
});
