/**
 * Wallet Address Resolution Pattern Tests
 *
 * Tests the address priority logic used consistently across 10+ files:
 *   zkLogin > local wallet > passkey > undefined
 *
 * This pattern appears in:
 * - TradingPanel.tsx (walletAddress)
 * - useTransactionExecutor.ts (walletAddress)
 * - OrderHistory.tsx (senderAddress)
 * - TradeHistory.tsx (senderAddress)
 * - useBalanceManagerBalance.ts (activeAddress)
 * - useMarginAccount.ts (address)
 * - Many more components
 *
 * Also tests the isConnected logic:
 *   (status === 'unlocked' && account) || isZkLoggedIn || isPasskeyUnlocked
 */

import { describe, it, expect } from 'vitest';

// ============================================
// Test Helpers — Mirror production code pattern
// ============================================

interface WalletState {
  status: 'disconnected' | 'locked' | 'unlocked';
  accountAddress: string | undefined;
  isZkLoggedIn: boolean;
  zkAddress: string | undefined;
  isPasskeyUnlocked: boolean;
  passkeyAddress: string | null;
}

/**
 * Mirror of the address resolution pattern in TradingPanel.tsx (L147-155)
 * and useTransactionExecutor.ts (L28-35)
 */
function resolveAddress(state: WalletState): string | undefined {
  const isLocalWalletActive = state.status === 'unlocked' && state.accountAddress;
  return state.isZkLoggedIn
    ? state.zkAddress
    : isLocalWalletActive
      ? state.accountAddress
      : state.isPasskeyUnlocked
        ? state.passkeyAddress ?? undefined
        : undefined;
}

/**
 * Mirror of the isConnected pattern in GettingStartedCard.tsx (L28),
 * TradingPanel.tsx (L148), Header.tsx, etc.
 */
function resolveIsConnected(state: WalletState): boolean {
  return (state.status === 'unlocked' && !!state.accountAddress) || state.isZkLoggedIn || state.isPasskeyUnlocked;
}

// ============================================
// Fixtures
// ============================================

const MOCK_LOCAL_ADDR = '0x1111111111111111111111111111111111111111111111111111111111111111';
const MOCK_ZK_ADDR = '0x2222222222222222222222222222222222222222222222222222222222222222';
const MOCK_PASSKEY_ADDR = '0x3333333333333333333333333333333333333333333333333333333333333333';

const BASE_STATE: WalletState = {
  status: 'disconnected',
  accountAddress: undefined,
  isZkLoggedIn: false,
  zkAddress: undefined,
  isPasskeyUnlocked: false,
  passkeyAddress: null,
};

// ============================================
// Tests
// ============================================

describe('Wallet Address Resolution Pattern', () => {
  // ------------------------------------------
  // Single wallet type active
  // ------------------------------------------
  describe('single wallet type', () => {
    it('resolves local wallet address when only local is unlocked', () => {
      const state: WalletState = {
        ...BASE_STATE,
        status: 'unlocked',
        accountAddress: MOCK_LOCAL_ADDR,
      };
      expect(resolveAddress(state)).toBe(MOCK_LOCAL_ADDR);
    });

    it('resolves zkLogin address when only zkLogin is connected', () => {
      const state: WalletState = {
        ...BASE_STATE,
        isZkLoggedIn: true,
        zkAddress: MOCK_ZK_ADDR,
      };
      expect(resolveAddress(state)).toBe(MOCK_ZK_ADDR);
    });

    it('resolves passkey address when only passkey is unlocked', () => {
      const state: WalletState = {
        ...BASE_STATE,
        isPasskeyUnlocked: true,
        passkeyAddress: MOCK_PASSKEY_ADDR,
      };
      expect(resolveAddress(state)).toBe(MOCK_PASSKEY_ADDR);
    });

    it('returns undefined when no wallet is connected', () => {
      expect(resolveAddress(BASE_STATE)).toBeUndefined();
    });
  });

  // ------------------------------------------
  // Priority: zkLogin > local > passkey
  // ------------------------------------------
  describe('address priority', () => {
    it('zkLogin takes priority over local wallet (CRITICAL)', () => {
      const state: WalletState = {
        ...BASE_STATE,
        status: 'unlocked',
        accountAddress: MOCK_LOCAL_ADDR,
        isZkLoggedIn: true,
        zkAddress: MOCK_ZK_ADDR,
      };
      // This is the bug that was in TradingPanel.tsx before the fix
      // The old code: account?.address ?? zkState?.address ?? passkeyAddress
      // would return MOCK_LOCAL_ADDR (wrong)
      expect(resolveAddress(state)).toBe(MOCK_ZK_ADDR);
    });

    it('zkLogin takes priority over passkey', () => {
      const state: WalletState = {
        ...BASE_STATE,
        isZkLoggedIn: true,
        zkAddress: MOCK_ZK_ADDR,
        isPasskeyUnlocked: true,
        passkeyAddress: MOCK_PASSKEY_ADDR,
      };
      expect(resolveAddress(state)).toBe(MOCK_ZK_ADDR);
    });

    it('zkLogin takes priority over both local and passkey', () => {
      const state: WalletState = {
        ...BASE_STATE,
        status: 'unlocked',
        accountAddress: MOCK_LOCAL_ADDR,
        isZkLoggedIn: true,
        zkAddress: MOCK_ZK_ADDR,
        isPasskeyUnlocked: true,
        passkeyAddress: MOCK_PASSKEY_ADDR,
      };
      expect(resolveAddress(state)).toBe(MOCK_ZK_ADDR);
    });

    it('local wallet takes priority over passkey', () => {
      const state: WalletState = {
        ...BASE_STATE,
        status: 'unlocked',
        accountAddress: MOCK_LOCAL_ADDR,
        isPasskeyUnlocked: true,
        passkeyAddress: MOCK_PASSKEY_ADDR,
      };
      expect(resolveAddress(state)).toBe(MOCK_LOCAL_ADDR);
    });

    it('passkey is last resort when others unavailable', () => {
      const state: WalletState = {
        ...BASE_STATE,
        status: 'locked', // local locked
        isZkLoggedIn: false, // no zkLogin
        isPasskeyUnlocked: true,
        passkeyAddress: MOCK_PASSKEY_ADDR,
      };
      expect(resolveAddress(state)).toBe(MOCK_PASSKEY_ADDR);
    });
  });

  // ------------------------------------------
  // Edge cases
  // ------------------------------------------
  describe('edge cases', () => {
    it('locked local wallet does not resolve address', () => {
      const state: WalletState = {
        ...BASE_STATE,
        status: 'locked',
        accountAddress: MOCK_LOCAL_ADDR, // has address but locked
      };
      expect(resolveAddress(state)).toBeUndefined();
    });

    it('disconnected local wallet does not resolve address', () => {
      const state: WalletState = {
        ...BASE_STATE,
        status: 'disconnected',
        accountAddress: undefined,
      };
      expect(resolveAddress(state)).toBeUndefined();
    });

    it('zkLogin connected but address is undefined returns undefined', () => {
      const state: WalletState = {
        ...BASE_STATE,
        isZkLoggedIn: true,
        zkAddress: undefined, // edge: connected but no address yet
      };
      expect(resolveAddress(state)).toBeUndefined();
    });

    it('passkey unlocked but address is null returns undefined', () => {
      const state: WalletState = {
        ...BASE_STATE,
        isPasskeyUnlocked: true,
        passkeyAddress: null, // edge: unlocked but address not derived yet
      };
      expect(resolveAddress(state)).toBeUndefined();
    });

    it('passkey unlocked but address is empty string returns empty string', () => {
      // Defensive: should not happen, but test that ?? undefined only catches null/undefined
      const state: WalletState = {
        ...BASE_STATE,
        isPasskeyUnlocked: true,
        passkeyAddress: '',
      };
      // Empty string is falsy but not null/undefined, so ?? doesn't trigger
      // This means '' would be returned. The caller should handle this.
      expect(resolveAddress(state)).toBe('');
    });

    it('local wallet unlocked but account address is undefined returns undefined', () => {
      const state: WalletState = {
        ...BASE_STATE,
        status: 'unlocked',
        accountAddress: undefined, // edge: unlocked but no account
      };
      // isLocalWalletActive = 'unlocked' && undefined = falsy
      expect(resolveAddress(state)).toBeUndefined();
    });

    it('zkLogin address overrides even when zkAddress is empty string', () => {
      // zkLogin connected overrides regardless of address value
      const state: WalletState = {
        ...BASE_STATE,
        isZkLoggedIn: true,
        zkAddress: '',
        status: 'unlocked',
        accountAddress: MOCK_LOCAL_ADDR,
      };
      // isZkLoggedIn is true, so zkAddress branch is taken → returns ''
      expect(resolveAddress(state)).toBe('');
    });
  });

  // ------------------------------------------
  // isConnected logic
  // ------------------------------------------
  describe('isConnected', () => {
    it('returns false when no wallet connected', () => {
      expect(resolveIsConnected(BASE_STATE)).toBe(false);
    });

    it('returns true when local wallet is unlocked', () => {
      expect(resolveIsConnected({
        ...BASE_STATE,
        status: 'unlocked',
        accountAddress: MOCK_LOCAL_ADDR,
      })).toBe(true);
    });

    it('returns true when zkLogin is connected', () => {
      expect(resolveIsConnected({
        ...BASE_STATE,
        isZkLoggedIn: true,
      })).toBe(true);
    });

    it('returns true when passkey is unlocked', () => {
      expect(resolveIsConnected({
        ...BASE_STATE,
        isPasskeyUnlocked: true,
      })).toBe(true);
    });

    it('returns false when local wallet is locked', () => {
      expect(resolveIsConnected({
        ...BASE_STATE,
        status: 'locked',
        accountAddress: MOCK_LOCAL_ADDR,
      })).toBe(false);
    });

    it('returns true when multiple wallets are active simultaneously', () => {
      expect(resolveIsConnected({
        ...BASE_STATE,
        status: 'unlocked',
        accountAddress: MOCK_LOCAL_ADDR,
        isZkLoggedIn: true,
        isPasskeyUnlocked: true,
      })).toBe(true);
    });

    it('returns false for unlocked status but no account address', () => {
      expect(resolveIsConnected({
        ...BASE_STATE,
        status: 'unlocked',
        accountAddress: undefined,
      })).toBe(false);
    });
  });

  // ------------------------------------------
  // Signing method selection (useTransactionExecutor pattern)
  // ------------------------------------------
  describe('signing method selection', () => {
    type SignMethod = 'zklogin' | 'local' | 'passkey' | 'none';

    function resolveSignMethod(state: WalletState & { hasLocalKeypair: boolean }): SignMethod {
      if (state.isZkLoggedIn) return 'zklogin';
      if (!state.isZkLoggedIn && !state.isPasskeyUnlocked && state.hasLocalKeypair) return 'local';
      if (state.isPasskeyUnlocked) return 'passkey';
      return 'none';
    }

    it('uses zkLogin signing when zkLogin is connected', () => {
      expect(resolveSignMethod({
        ...BASE_STATE,
        isZkLoggedIn: true,
        zkAddress: MOCK_ZK_ADDR,
        hasLocalKeypair: false,
      })).toBe('zklogin');
    });

    it('uses local signing when only local wallet is active', () => {
      expect(resolveSignMethod({
        ...BASE_STATE,
        status: 'unlocked',
        accountAddress: MOCK_LOCAL_ADDR,
        hasLocalKeypair: true,
      })).toBe('local');
    });

    it('uses passkey signing when only passkey is active', () => {
      expect(resolveSignMethod({
        ...BASE_STATE,
        isPasskeyUnlocked: true,
        passkeyAddress: MOCK_PASSKEY_ADDR,
        hasLocalKeypair: false,
      })).toBe('passkey');
    });

    it('prefers zkLogin over local for signing', () => {
      expect(resolveSignMethod({
        ...BASE_STATE,
        isZkLoggedIn: true,
        zkAddress: MOCK_ZK_ADDR,
        status: 'unlocked',
        accountAddress: MOCK_LOCAL_ADDR,
        hasLocalKeypair: true,
      })).toBe('zklogin');
    });

    it('returns none when no signing method available', () => {
      expect(resolveSignMethod({
        ...BASE_STATE,
        hasLocalKeypair: false,
      })).toBe('none');
    });
  });
});
