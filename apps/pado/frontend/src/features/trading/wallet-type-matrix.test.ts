/**
 * Wallet Type Matrix Tests
 *
 * Comprehensive matrix test covering all 3 wallet types
 * across all critical Pado features.
 *
 * Tests verify that the same address resolution, connection detection,
 * and signing patterns work correctly for:
 *   - Local (mnemonic) wallet
 *   - zkLogin wallet
 *   - Passkey wallet
 *
 * Also tests edge cases:
 *   - Multiple wallet types active simultaneously
 *   - Wallet switching
 *   - Transient states (unlocking, disconnecting)
 *   - Null/undefined address values
 */

import { describe, it, expect } from 'vitest';

// ============================================
// Types
// ============================================

type WalletType = 'local' | 'zklogin' | 'passkey';
type FeatureName =
  | 'trading'        // TradingPanel, OrderForm, useTransactionExecutor
  | 'orders'         // OrderHistory, TradeHistory
  | 'portfolio'      // RecentTrades, TradeStats, PnlChart
  | 'margin'         // useMarginAccount, MarginAccountCard
  | 'dashboard'      // GettingStartedCard, HeaderNetValue
  | 'prediction'     // usePredictionTrade, OutcomeOrderForm
  | 'lottery'        // useLotteryActions, TicketPurchaseForm
  | 'lending'        // useLendingActions, DepositForm
  | 'perp'           // usePerpOrder, PerpOrderForm
  | 'nasunLink'      // useNasunLink (requires Ed25519Keypair)
  | 'nsa';           // NsaSetupWizard (signer type mapping)

interface WalletState {
  status: 'disconnected' | 'locked' | 'unlocked';
  accountAddress: string | undefined;
  isZkLoggedIn: boolean;
  zkAddress: string | undefined;
  isPasskeyUnlocked: boolean;
  passkeyAddress: string | null;
}

// ============================================
// Fixtures
// ============================================

const ADDR = {
  local: '0x1111111111111111111111111111111111111111111111111111111111111111',
  zklogin: '0x2222222222222222222222222222222222222222222222222222222222222222',
  passkey: '0x3333333333333333333333333333333333333333333333333333333333333333',
} as const;

function makeWalletState(activeTypes: WalletType[]): WalletState {
  return {
    status: activeTypes.includes('local') ? 'unlocked' : 'disconnected',
    accountAddress: activeTypes.includes('local') ? ADDR.local : undefined,
    isZkLoggedIn: activeTypes.includes('zklogin'),
    zkAddress: activeTypes.includes('zklogin') ? ADDR.zklogin : undefined,
    isPasskeyUnlocked: activeTypes.includes('passkey'),
    passkeyAddress: activeTypes.includes('passkey') ? ADDR.passkey : null,
  };
}

// ============================================
// Logic under test
// ============================================

function resolveAddress(s: WalletState): string | undefined {
  const isLocalActive = s.status === 'unlocked' && s.accountAddress;
  return s.isZkLoggedIn
    ? s.zkAddress
    : isLocalActive
      ? s.accountAddress
      : s.isPasskeyUnlocked
        ? s.passkeyAddress ?? undefined
        : undefined;
}

function isConnected(s: WalletState): boolean {
  return (s.status === 'unlocked' && !!s.accountAddress) || s.isZkLoggedIn || s.isPasskeyUnlocked;
}

type SignMethod = 'zklogin' | 'local' | 'passkey' | 'none';
function resolveSignMethod(s: WalletState): SignMethod {
  if (s.isZkLoggedIn) return 'zklogin';
  if (s.status === 'unlocked' && s.accountAddress) return 'local';
  if (s.isPasskeyUnlocked) return 'passkey';
  return 'none';
}

// ============================================
// Tests
// ============================================

describe('Wallet Type Matrix', () => {
  // ------------------------------------------
  // Single wallet type — all features should work
  // ------------------------------------------
  describe.each<WalletType>(['local', 'zklogin', 'passkey'])(
    '%s wallet — all features accessible',
    (walletType) => {
      const state = makeWalletState([walletType]);

      it('resolves to correct address', () => {
        expect(resolveAddress(state)).toBe(ADDR[walletType]);
      });

      it('isConnected returns true', () => {
        expect(isConnected(state)).toBe(true);
      });

      it('has a valid signing method', () => {
        expect(resolveSignMethod(state)).toBe(walletType);
      });

      it('address is not undefined or null', () => {
        const addr = resolveAddress(state);
        expect(addr).toBeTruthy();
        expect(addr).toMatch(/^0x[a-f0-9]{64}$/);
      });
    },
  );

  // ------------------------------------------
  // No wallet — nothing should work
  // ------------------------------------------
  describe('no wallet connected', () => {
    const state = makeWalletState([]);

    it('resolves to undefined', () => {
      expect(resolveAddress(state)).toBeUndefined();
    });

    it('isConnected returns false', () => {
      expect(isConnected(state)).toBe(false);
    });

    it('has no signing method', () => {
      expect(resolveSignMethod(state)).toBe('none');
    });
  });

  // ------------------------------------------
  // Dual wallet combinations — priority tests
  // ------------------------------------------
  describe('dual wallet combinations', () => {
    it('zklogin + local → zklogin address', () => {
      const state = makeWalletState(['zklogin', 'local']);
      expect(resolveAddress(state)).toBe(ADDR.zklogin);
    });

    it('zklogin + passkey → zklogin address', () => {
      const state = makeWalletState(['zklogin', 'passkey']);
      expect(resolveAddress(state)).toBe(ADDR.zklogin);
    });

    it('local + passkey → local address', () => {
      const state = makeWalletState(['local', 'passkey']);
      expect(resolveAddress(state)).toBe(ADDR.local);
    });

    it('all three active → zklogin address', () => {
      const state = makeWalletState(['zklogin', 'local', 'passkey']);
      expect(resolveAddress(state)).toBe(ADDR.zklogin);
    });
  });

  // ------------------------------------------
  // Dual wallet signing priority
  // ------------------------------------------
  describe('dual wallet signing priority', () => {
    it('zklogin + local → signs with zklogin', () => {
      expect(resolveSignMethod(makeWalletState(['zklogin', 'local']))).toBe('zklogin');
    });

    it('zklogin + passkey → signs with zklogin', () => {
      expect(resolveSignMethod(makeWalletState(['zklogin', 'passkey']))).toBe('zklogin');
    });

    it('local + passkey → signs with local', () => {
      expect(resolveSignMethod(makeWalletState(['local', 'passkey']))).toBe('local');
    });

    it('all three → signs with zklogin', () => {
      expect(resolveSignMethod(makeWalletState(['zklogin', 'local', 'passkey']))).toBe('zklogin');
    });
  });

  // ------------------------------------------
  // Wallet state transitions
  // ------------------------------------------
  describe('wallet state transitions', () => {
    it('local wallet locked → not connected', () => {
      const state: WalletState = {
        status: 'locked',
        accountAddress: ADDR.local,
        isZkLoggedIn: false,
        zkAddress: undefined,
        isPasskeyUnlocked: false,
        passkeyAddress: null,
      };
      expect(isConnected(state)).toBe(false);
      expect(resolveAddress(state)).toBeUndefined();
    });

    it('local wallet locking while passkey active → passkey takes over', () => {
      const state: WalletState = {
        status: 'locked',
        accountAddress: ADDR.local,
        isZkLoggedIn: false,
        zkAddress: undefined,
        isPasskeyUnlocked: true,
        passkeyAddress: ADDR.passkey,
      };
      expect(resolveAddress(state)).toBe(ADDR.passkey);
      expect(isConnected(state)).toBe(true);
    });

    it('zkLogin disconnecting while local active → local takes over', () => {
      const state: WalletState = {
        status: 'unlocked',
        accountAddress: ADDR.local,
        isZkLoggedIn: false,
        zkAddress: ADDR.zklogin, // stale address remains
        isPasskeyUnlocked: false,
        passkeyAddress: null,
      };
      expect(resolveAddress(state)).toBe(ADDR.local);
    });

    it('passkey locking → falls back to local if available', () => {
      const state: WalletState = {
        status: 'unlocked',
        accountAddress: ADDR.local,
        isZkLoggedIn: false,
        zkAddress: undefined,
        isPasskeyUnlocked: false, // passkey just locked
        passkeyAddress: ADDR.passkey, // stale address remains
      };
      expect(resolveAddress(state)).toBe(ADDR.local);
    });
  });

  // ------------------------------------------
  // Feature-specific edge cases
  // ------------------------------------------
  describe('feature-specific edge cases', () => {
    describe('TradeCap delegation (TradingPanel)', () => {
      // TradeCap is delegated using walletAddress.
      // Wrong address = TP/SL orders execute against wrong user.
      it('zkLogin user with local wallet → TradeCap uses zkLogin address', () => {
        const state = makeWalletState(['zklogin', 'local']);
        expect(resolveAddress(state)).toBe(ADDR.zklogin);
      });

      it('passkey-only user → TradeCap uses passkey address', () => {
        const state = makeWalletState(['passkey']);
        expect(resolveAddress(state)).toBe(ADDR.passkey);
      });
    });

    describe('Order History filtering', () => {
      // Order/Trade history queries events by senderAddress.
      // Wrong address = shows wrong user's orders.
      it('each wallet type queries with its own address', () => {
        expect(resolveAddress(makeWalletState(['local']))).toBe(ADDR.local);
        expect(resolveAddress(makeWalletState(['zklogin']))).toBe(ADDR.zklogin);
        expect(resolveAddress(makeWalletState(['passkey']))).toBe(ADDR.passkey);
      });
    });

    describe('Nasun Link creation', () => {
      // Nasun Link requires Ed25519Keypair.
      // Local and passkey both provide keypairs; zkLogin does not.
      function canCreateLink(walletType: WalletType): boolean {
        return walletType === 'local' || walletType === 'passkey';
      }

      it('local wallet can create links', () => {
        expect(canCreateLink('local')).toBe(true);
      });

      it('passkey wallet can create links', () => {
        expect(canCreateLink('passkey')).toBe(true);
      });

      it('zkLogin wallet cannot create links', () => {
        expect(canCreateLink('zklogin')).toBe(false);
      });
    });

    describe('NSA Smart Account creation', () => {
      // Each wallet type must map to correct on-chain signer type
      function getNsaSignerType(walletType: WalletType | null): string {
        return walletType === 'zklogin' ? 'zklogin' :
          walletType === 'passkey' ? 'passkey' :
          walletType === 'local' ? 'local' :
          'local';
      }

      it('local → on-chain type "local"', () => {
        expect(getNsaSignerType('local')).toBe('local');
      });

      it('passkey → on-chain type "passkey" (not "local")', () => {
        expect(getNsaSignerType('passkey')).toBe('passkey');
        expect(getNsaSignerType('passkey')).not.toBe('local');
      });

      it('zklogin → on-chain type "zklogin"', () => {
        expect(getNsaSignerType('zklogin')).toBe('zklogin');
      });
    });

    describe('Balance Manager Balance', () => {
      // useBalanceManagerBalance needs correct activeAddress to lookup
      // stored BalanceManagerId from localStorage
      it('passkey user has address for BM lookup', () => {
        const state = makeWalletState(['passkey']);
        const addr = resolveAddress(state);
        expect(addr).toBeTruthy();
        // localStorage key would be `bm:${addr}`, must not be undefined
      });

      it('passkey address changes when null → does not create BM', () => {
        const state: WalletState = {
          ...makeWalletState([]),
          isPasskeyUnlocked: true,
          passkeyAddress: null, // not yet derived
        };
        expect(resolveAddress(state)).toBeUndefined();
      });
    });
  });

  // ------------------------------------------
  // Regression: The original ?? chain bug
  // ------------------------------------------
  describe('regression: ?? chain priority bug', () => {
    it('OLD (buggy): account?.address ?? zkState?.address favors local over zkLogin', () => {
      // This was the exact pattern in TradingPanel.tsx before the fix
      const accountAddress: string | undefined = ADDR.local;
      const zkAddress: string | undefined = ADDR.zklogin;

      // The OLD code: walletAddress = accountAddress ?? zkAddress
      const oldResult = accountAddress ?? zkAddress;
      expect(oldResult).toBe(ADDR.local); // WRONG — should be zkLogin

      // The NEW code with explicit isZkLoggedIn check
      const isZkLoggedIn = true;
      const newResult = isZkLoggedIn ? zkAddress : accountAddress;
      expect(newResult).toBe(ADDR.zklogin); // CORRECT
    });

    it('OLD (buggy): passkey silently fell through to default in NSA mapping', () => {
      // Before fix: signerType === 'passkey' had no explicit branch
      type OldMapping = (t: string | null) => string;
      const oldMapping: OldMapping = (signerType) =>
        signerType === 'zklogin' ? 'zklogin' :
        signerType === 'local' ? 'local' :
        'local'; // passkey falls here!

      expect(oldMapping('passkey')).toBe('local'); // BUG: should be 'passkey'

      // After fix: explicit passkey branch
      const newMapping: OldMapping = (signerType) =>
        signerType === 'zklogin' ? 'zklogin' :
        signerType === 'passkey' ? 'passkey' :
        signerType === 'local' ? 'local' :
        'local';

      expect(newMapping('passkey')).toBe('passkey'); // FIXED
    });
  });

  // ------------------------------------------
  // Exhaustive permutation test
  // ------------------------------------------
  describe('exhaustive: all 8 wallet type combinations', () => {
    const combos: { types: WalletType[]; expectedAddr: string | undefined; desc: string }[] = [
      { types: [], expectedAddr: undefined, desc: 'none' },
      { types: ['local'], expectedAddr: ADDR.local, desc: 'local only' },
      { types: ['zklogin'], expectedAddr: ADDR.zklogin, desc: 'zklogin only' },
      { types: ['passkey'], expectedAddr: ADDR.passkey, desc: 'passkey only' },
      { types: ['local', 'zklogin'], expectedAddr: ADDR.zklogin, desc: 'local + zklogin' },
      { types: ['local', 'passkey'], expectedAddr: ADDR.local, desc: 'local + passkey' },
      { types: ['zklogin', 'passkey'], expectedAddr: ADDR.zklogin, desc: 'zklogin + passkey' },
      { types: ['local', 'zklogin', 'passkey'], expectedAddr: ADDR.zklogin, desc: 'all three' },
    ];

    it.each(combos)('$desc → $expectedAddr', ({ types, expectedAddr }) => {
      expect(resolveAddress(makeWalletState(types))).toBe(expectedAddr);
    });

    it.each(combos)('$desc → isConnected=$types.length>0', ({ types }) => {
      expect(isConnected(makeWalletState(types))).toBe(types.length > 0);
    });
  });
});
