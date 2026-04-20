/**
 * Nasun Link Transfer Tests
 *
 * Tests the claim (executeTransfer) and generator (fundEphemeralAddress)
 * logic with mocked SuiClient, verifying:
 * - Native token claim with single/multiple coins
 * - Exact amount delivery with gas budget
 * - Backward compatibility with old links (no gas budget)
 * - Edge cases: zero balance, insufficient gas, etc.
 * - Generator sends amount + gas budget for native tokens
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// We test through public functions: claimLink and createLink
import { claimLink } from '../core/link/claim';
import { createLink } from '../core/link/generator';
import { serializeLinkConfig } from '../core/link/types';
import type { LinkData, LinkConfig } from '../core/link/types';
import {
  generateEphemeralKeypair,
  encryptPayload,
  generateSecret,
  generateLinkId,
} from '../core/link/crypto';

// ============================================
// Mocks
// ============================================

// Capture Transaction methods for assertion
const txMethods = {
  mergeCoins: vi.fn(),
  splitCoins: vi.fn().mockReturnValue([{ $kind: 'Result' }]),
  transferObjects: vi.fn(),
  object: vi.fn((id: string) => ({ $kind: 'Input', objectId: id })),
  gas: { $kind: 'GasPayment' },
  pure: {
    u64: vi.fn((val: bigint | number) => ({ $kind: 'Pure', value: val })),
    address: vi.fn((addr: string) => ({ $kind: 'Pure', value: addr })),
  },
};

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn().mockImplementation(() => txMethods),
}));

// Mock SuiClient
const mockGetCoins = vi.fn();
const mockSignAndExecuteTransaction = vi.fn();

vi.mock('../sui/client', () => ({
  getSuiClient: vi.fn(() => ({
    getCoins: mockGetCoins,
    signAndExecuteTransaction: mockSignAndExecuteTransaction,
  })),
}));

// Lazy-initialized ephemeral keypair for mock (avoids hoisting issues)
let mockEphemeralKeypair: Ed25519Keypair;
let mockEphemeralAddress: string;

// Mock recoverKeypair to return our test keypair
const mockRecoverKeypair = vi.fn();

vi.mock('../core/link/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/link/crypto')>();
  return {
    ...actual,
    recoverKeypair: (...args: unknown[]) => mockRecoverKeypair(...args),
  };
});

// ============================================
// Helpers
// ============================================

const CLAIM_GAS_RESERVE = 50_000_000n;
const GAS_BUDGET_FOR_CLAIM = 50_000_000n;
const ONE_NSN = 1_000_000_000n; // 1 NSN = 10^9 MIST

function createTestLinkData(overrides: Partial<LinkData> = {}): LinkData {
  return {
    id: 'test-link-id',
    creator: '0x' + 'a'.repeat(64),
    ephemeralAddress: mockEphemeralAddress,
    encryptedPayload: 'mock-encrypted-payload',
    config: serializeLinkConfig({
      type: 'single',
      coinType: 'NSN',
      amount: ONE_NSN,
    }),
    status: 'active',
    claimCount: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

function mockCoinResponse(coins: Array<{ id: string; balance: string }>) {
  return {
    data: coins.map((c) => ({
      coinObjectId: c.id,
      balance: c.balance,
      coinType: '0x2::sui::SUI',
      version: '1',
      digest: 'mock-digest',
      previousTransaction: 'mock-tx',
    })),
    nextCursor: null,
    hasNextPage: false,
  };
}

function mockSuccessfulTx(digest = 'tx-digest-123') {
  mockSignAndExecuteTransaction.mockResolvedValue({
    digest,
    effects: { status: { status: 'success' } },
  });
}

function mockFailedTx(error = 'Unknown error') {
  mockSignAndExecuteTransaction.mockResolvedValue({
    digest: 'failed-tx',
    effects: { status: { status: 'failure', error } },
  });
}

const RECIPIENT = '0x' + 'b'.repeat(64);

// ============================================
// Tests
// ============================================

describe('Nasun Link Transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Initialize ephemeral keypair
    if (!mockEphemeralKeypair) {
      mockEphemeralKeypair = new Ed25519Keypair();
      mockEphemeralAddress = mockEphemeralKeypair.toSuiAddress();
    }
    mockRecoverKeypair.mockResolvedValue(mockEphemeralKeypair);
    // Reset transaction mock methods
    txMethods.mergeCoins.mockClear();
    txMethods.splitCoins.mockClear().mockReturnValue([{ $kind: 'Result' }]);
    txMethods.transferObjects.mockClear();
    txMethods.object.mockClear().mockImplementation((id: string) => ({ $kind: 'Input', objectId: id }));
  });

  // ============================================
  // Native Token Claim - Single Coin (most common)
  // ============================================

  describe('Native token claim - single coin (common case)', () => {
    it('should claim exact amount when gas budget is included (new links)', async () => {
      // New link: ephemeral has amount + gas budget
      const amount = 22n * ONE_NSN; // 22 NSN
      const totalBalance = amount + GAS_BUDGET_FOR_CLAIM; // 22.05 NSN

      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'coin-1', balance: totalBalance.toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);

      // Should send exact amount (not totalBalance - reserve)
      expect(result.amount).toBe(amount);
      // Should NOT merge (single coin)
      expect(txMethods.mergeCoins).not.toHaveBeenCalled();
      // Should split and transfer
      expect(txMethods.splitCoins).toHaveBeenCalledWith(
        txMethods.gas,
        [expect.anything()]
      );
      expect(txMethods.transferObjects).toHaveBeenCalled();
    });

    it('should NOT call mergeCoins when ephemeral has exactly 1 coin', async () => {
      const amount = 5n * ONE_NSN;
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'single-coin', balance: (amount + GAS_BUDGET_FOR_CLAIM).toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      await claimLink(linkData, 'secret', RECIPIENT);

      // The critical fix: no mergeCoins with 1 coin
      expect(txMethods.mergeCoins).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Native Token Claim - Multiple Coins
  // ============================================

  describe('Native token claim - multiple coins', () => {
    it('should merge multiple coins before splitting', async () => {
      const amount = 10n * ONE_NSN;
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([
          { id: 'coin-a', balance: (6n * ONE_NSN).toString() },
          { id: 'coin-b', balance: (4n * ONE_NSN + GAS_BUDGET_FOR_CLAIM).toString() },
        ])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);

      expect(result.amount).toBe(amount);
      // Should merge when multiple coins
      expect(txMethods.mergeCoins).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // Backward Compatibility (old links without gas budget)
  // ============================================

  describe('Backward compatibility - old links', () => {
    it('should fall back to totalBalance - reserve when no gas budget included', async () => {
      // Old link: ephemeral has exactly `amount` (no extra gas budget)
      const amount = 10n * ONE_NSN;
      const totalBalance = amount; // No extra gas

      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'old-coin', balance: totalBalance.toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);

      // Falls back: totalBalance < amount + CLAIM_GAS_RESERVE
      // sendAmount = totalBalance - CLAIM_GAS_RESERVE
      expect(result.amount).toBe(totalBalance - CLAIM_GAS_RESERVE);
    });

    it('should handle old link with zero config amount', async () => {
      // Edge case: old link data where amount is 0 in config
      const totalBalance = 5n * ONE_NSN;

      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'zero-cfg-coin', balance: totalBalance.toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount: 0n }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);

      // amount=0 triggers fallback: totalBalance - CLAIM_GAS_RESERVE
      expect(result.amount).toBe(totalBalance - CLAIM_GAS_RESERVE);
    });
  });

  // ============================================
  // Error Cases
  // ============================================

  describe('Error cases', () => {
    it('should throw when ephemeral has no coins', async () => {
      mockGetCoins.mockResolvedValue(mockCoinResponse([]));

      const linkData = createTestLinkData();
      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow('Link has no funds');
    });

    it('should throw when total balance is zero', async () => {
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'empty-coin', balance: '0' }])
      );

      const linkData = createTestLinkData();
      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow('Link has zero balance');
    });

    it('should show "already claimed" when dust remains from previous claim', async () => {
      // After a successful claim, ephemeral has only gas dust left
      const amount = 5n * ONE_NSN;
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'dust-coin', balance: '10000000' }]) // 0.01 NSN dust
      );

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow(
        'This link has already been claimed'
      );
    });

    it('should show "balance too low" when genuinely underfunded (no config amount)', async () => {
      // Old link with amount=0 and insufficient balance
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'dust-coin', balance: CLAIM_GAS_RESERVE.toString() }])
      );

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount: 0n }),
      });

      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow(
        'Link balance too low to cover gas fees'
      );
    });

    it('should show "balance too low" when balance is less than gas reserve', async () => {
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'tiny-coin', balance: '1000000' }]) // 0.001 NSN
      );

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount: 0n }),
      });

      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow(
        'Link balance too low to cover gas fees'
      );
    });

    it('should throw on failed transaction', async () => {
      const amount = ONE_NSN;
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'coin', balance: (amount + GAS_BUDGET_FOR_CLAIM).toString() }])
      );
      mockFailedTx('InsufficientGas');

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow('Transfer failed');
    });

    it('should throw for inactive link (claimed)', async () => {
      const linkData = createTestLinkData({ status: 'claimed' });
      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow('Link is claimed');
    });

    it('should throw for expired link', async () => {
      const linkData = createTestLinkData({
        config: serializeLinkConfig({
          type: 'single',
          coinType: 'NSN',
          amount: ONE_NSN,
          expiresAt: Date.now() - 60_000, // Expired 1 min ago
        }),
      });
      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow('Link has expired');
    });

    it('should throw for cancelled link', async () => {
      const linkData = createTestLinkData({ status: 'cancelled' });
      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow('Link is cancelled');
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge cases', () => {
    it('should handle very small amount (1 MIST above gas reserve)', async () => {
      const amount = 1n; // 1 MIST
      const totalBalance = amount + GAS_BUDGET_FOR_CLAIM;

      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'tiny', balance: totalBalance.toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);
      expect(result.amount).toBe(1n);
    });

    it('should handle very large amount (near u64 max)', async () => {
      const amount = 18_000_000_000_000_000_000n; // 18 * 10^18
      const totalBalance = amount + GAS_BUDGET_FOR_CLAIM;

      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'whale', balance: totalBalance.toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);
      expect(result.amount).toBe(amount);
    });

    it('should handle ephemeral with extra funds (e.g. airdrop dust)', async () => {
      // Ephemeral received more than amount + gas (unexpected extra funds)
      const amount = 10n * ONE_NSN;
      const totalBalance = amount + GAS_BUDGET_FOR_CLAIM + 500_000_000n; // 0.5 NSN extra

      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'extra', balance: totalBalance.toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);
      // Should still send exact amount, not totalBalance - reserve
      expect(result.amount).toBe(amount);
    });

    it('should return correct linkId and recipient in result', async () => {
      const amount = ONE_NSN;
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'coin', balance: (amount + GAS_BUDGET_FOR_CLAIM).toString() }])
      );
      mockSuccessfulTx('specific-digest');

      const linkData = createTestLinkData({
        id: 'my-link-42',
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);
      expect(result.txDigest).toBe('specific-digest');
      expect(result.recipient).toBe(RECIPIENT);
      expect(result.linkId).toBe('my-link-42');
    });
  });

  // ============================================
  // Non-native Token Claim
  // ============================================

  describe('Non-native token claim', () => {
    it('should transfer all non-native tokens to recipient', async () => {
      const amount = 100_000_000n; // 100 NUSDC (6 decimals)
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'nusdc-coin', balance: amount.toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({
          type: 'single',
          coinType: '0x123::nusdc::NUSDC',
          amount,
        }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);
      expect(result.amount).toBe(amount);
      // Non-native: no mergeCoins for single coin
      expect(txMethods.mergeCoins).not.toHaveBeenCalled();
      expect(txMethods.transferObjects).toHaveBeenCalled();
    });

    it('should merge multiple non-native token coins', async () => {
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([
          { id: 'nusdc-1', balance: '60000000' },
          { id: 'nusdc-2', balance: '40000000' },
        ])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({
          type: 'single',
          coinType: '0x123::nusdc::NUSDC',
          amount: 100_000_000n,
        }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);
      expect(result.amount).toBe(100_000_000n);
      // Multiple coins: should merge
      expect(txMethods.mergeCoins).toHaveBeenCalledTimes(1);
    });

    it('should throw when no non-native tokens found', async () => {
      mockGetCoins.mockResolvedValue(mockCoinResponse([]));

      const linkData = createTestLinkData({
        config: serializeLinkConfig({
          type: 'single',
          coinType: '0x123::nusdc::NUSDC',
          amount: 100_000_000n,
        }),
      });

      await expect(claimLink(linkData, 'secret', RECIPIENT)).rejects.toThrow(
        'Link has no funds for specified token'
      );
    });
  });

  // ============================================
  // Generator - Native Token Gas Budget
  // ============================================

  describe('Generator - native token gas inclusion', () => {
    it('should send amount + gas budget for native token links', async () => {
      const senderKeypair = new Ed25519Keypair();
      const amount = 10n * ONE_NSN;

      mockSignAndExecuteTransaction.mockResolvedValue({
        digest: 'funding-tx',
        effects: { status: { status: 'success' } },
      });

      const config: LinkConfig = {
        type: 'single',
        coinType: 'NSN',
        amount,
      };

      await createLink(config, senderKeypair);

      // Verify splitCoins was called with amount + GAS_BUDGET_FOR_CLAIM
      expect(txMethods.splitCoins).toHaveBeenCalled();
      const splitCall = txMethods.splitCoins.mock.calls[0];
      // First arg is tx.gas
      expect(splitCall[0]).toBe(txMethods.gas);
      // Second arg array should contain amount + gas budget
      const splitAmount = splitCall[1][0];
      expect(splitAmount).toEqual(
        expect.objectContaining({ value: amount + GAS_BUDGET_FOR_CLAIM })
      );
    });

    it('should send separate gas coin for non-native token links', async () => {
      const senderKeypair = new Ed25519Keypair();
      senderKeypair.toSuiAddress();

      // Mock getCoins for non-native token lookup
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'sender-nusdc', balance: '500000000' }])
      );
      mockSignAndExecuteTransaction.mockResolvedValue({
        digest: 'funding-tx',
        effects: { status: { status: 'success' } },
      });

      const config: LinkConfig = {
        type: 'single',
        coinType: '0x123::nusdc::NUSDC',
        amount: 100_000_000n,
      };

      await createLink(config, senderKeypair);

      // Should have 2 splitCoins calls:
      // 1. Split the non-native token
      // 2. Split gas budget from tx.gas
      expect(txMethods.splitCoins).toHaveBeenCalledTimes(2);
      // And 2 transferObjects calls (token + gas coin)
      expect(txMethods.transferObjects).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================
  // Coin Type Normalization
  // ============================================

  describe('Coin type normalization', () => {
    it('should treat "NSN" as native token type', async () => {
      const amount = ONE_NSN;
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'nsn-coin', balance: (amount + GAS_BUDGET_FOR_CLAIM).toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'NSN', amount }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);
      expect(result.amount).toBe(amount);
      // getCoins should be called with native type
      expect(mockGetCoins).toHaveBeenCalledWith(
        expect.objectContaining({ coinType: '0x2::sui::SUI' })
      );
    });

    it('should treat "SUI" as native token type', async () => {
      const amount = ONE_NSN;
      mockGetCoins.mockResolvedValue(
        mockCoinResponse([{ id: 'sui-coin', balance: (amount + GAS_BUDGET_FOR_CLAIM).toString() }])
      );
      mockSuccessfulTx();

      const linkData = createTestLinkData({
        config: serializeLinkConfig({ type: 'single', coinType: 'SUI', amount }),
      });

      const result = await claimLink(linkData, 'secret', RECIPIENT);
      expect(result.amount).toBe(amount);
    });
  });
});
