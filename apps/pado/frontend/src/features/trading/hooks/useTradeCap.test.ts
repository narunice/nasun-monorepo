import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock dependencies
vi.mock('./useTransactionExecutor', () => ({
  useTransactionExecutor: () => ({
    executeTransaction: vi.fn().mockResolvedValue({
      success: true,
      objectChanges: [
        {
          type: 'created',
          objectType: '0xpkg::balance_manager::TradeCap',
          objectId: '0xtradecap123',
        },
      ],
    }),
  }),
}));

vi.mock('../../../config/network', () => ({
  NETWORK_CONFIG: {
    deepbookPackage: '0xdeepbook-pkg',
  },
}));

vi.mock('../../../lib/sui-client', () => ({
  getSuiClient: () => ({
    getObject: vi.fn().mockResolvedValue({ data: { objectId: '0xstored-cap' } }),
  }),
}));

vi.mock('../lib/tpsl-api', () => ({
  isKeeperConfigured: () => true,
  getUserTPSLOrders: vi.fn().mockResolvedValue([]),
  cancelTPSLOrder: vi.fn().mockResolvedValue({}),
}));

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn().mockImplementation(() => ({
    moveCall: vi.fn().mockReturnValue(['mock-tradecap']),
    transferObjects: vi.fn(),
    object: vi.fn((id: string) => id),
  })),
}));

// Stub env vars
vi.stubEnv('VITE_TPSL_KEEPER_ADDRESS', '0xkeeper-address-abc');

import { useTradeCap } from './useTradeCap';

const BALANCE_MANAGER_ID = '0xbm-123';
const WALLET_ADDRESS = '0xwallet-456';

// ========================================
// useTradeCap Hook
// ========================================
describe('useTradeCap', () => {
  describe('initial state', () => {
    it('starts with status "none" when no stored state', () => {
      const { result } = renderHook(() =>
        useTradeCap(BALANCE_MANAGER_ID, WALLET_ADDRESS)
      );

      expect(result.current.status).toBe('none');
      expect(result.current.tradeCapId).toBeNull();
      expect(result.current.keeperAddress).toBeNull();
    });

    it('isKeeperAvailable is false when KEEPER_ADDRESS env var not set at import time', () => {
      // KEEPER_ADDRESS is evaluated at module import time from import.meta.env.
      // In test environment, VITE_TPSL_KEEPER_ADDRESS is empty, so isKeeperAvailable = false.
      const { result } = renderHook(() =>
        useTradeCap(BALANCE_MANAGER_ID, WALLET_ADDRESS)
      );

      expect(result.current.isKeeperAvailable).toBe(false);
    });
  });

  describe('localStorage restore', () => {
    it('restores delegated state from localStorage', async () => {
      const storedState = {
        tradeCapId: '0xstored-cap',
        keeperAddress: '0xkeeper-address-abc',
        delegatedAt: Date.now(),
      };
      localStorage.setItem(
        `pado:tradecap:${WALLET_ADDRESS}`,
        JSON.stringify(storedState)
      );

      const { result } = renderHook(() =>
        useTradeCap(BALANCE_MANAGER_ID, WALLET_ADDRESS)
      );

      await waitFor(() => {
        expect(result.current.status).toBe('delegated');
      });
      expect(result.current.tradeCapId).toBe('0xstored-cap');
      expect(result.current.keeperAddress).toBe('0xkeeper-address-abc');
    });

    it('ignores malformed localStorage data', () => {
      localStorage.setItem(
        `pado:tradecap:${WALLET_ADDRESS}`,
        'corrupted-data'
      );

      const { result } = renderHook(() =>
        useTradeCap(BALANCE_MANAGER_ID, WALLET_ADDRESS)
      );

      expect(result.current.status).toBe('none');
    });

    it('ignores localStorage data with missing fields', () => {
      localStorage.setItem(
        `pado:tradecap:${WALLET_ADDRESS}`,
        JSON.stringify({ tradeCapId: '0xabc' }) // missing keeperAddress, delegatedAt
      );

      const { result } = renderHook(() =>
        useTradeCap(BALANCE_MANAGER_ID, WALLET_ADDRESS)
      );

      expect(result.current.status).toBe('none');
    });
  });

  describe('delegate', () => {
    it('returns error when balanceManagerId is missing', async () => {
      const { result } = renderHook(() =>
        useTradeCap(null, WALLET_ADDRESS)
      );

      const res = await act(() => result.current.delegate());
      expect(res.success).toBe(false);
      expect(res.error).toContain('Missing configuration');
    });

    it('returns error when walletAddress is missing', async () => {
      const { result } = renderHook(() =>
        useTradeCap(BALANCE_MANAGER_ID, undefined)
      );

      const res = await act(() => result.current.delegate());
      expect(res.success).toBe(false);
      expect(res.error).toContain('Missing configuration');
    });
  });

  describe('revoke', () => {
    it('returns error when no TradeCap delegated', async () => {
      const { result } = renderHook(() =>
        useTradeCap(BALANCE_MANAGER_ID, WALLET_ADDRESS)
      );

      const res = await act(() => result.current.revoke());
      expect(res.success).toBe(false);
      expect(res.error).toContain('No TradeCap delegated');
    });
  });

  describe('wallet address changes', () => {
    it('resets state when wallet address changes', async () => {
      const storedState = {
        tradeCapId: '0xstored-cap',
        keeperAddress: '0xkeeper-address-abc',
        delegatedAt: Date.now(),
      };
      localStorage.setItem(
        `pado:tradecap:${WALLET_ADDRESS}`,
        JSON.stringify(storedState)
      );

      const { result, rerender } = renderHook(
        ({ addr }) => useTradeCap(BALANCE_MANAGER_ID, addr),
        { initialProps: { addr: WALLET_ADDRESS } }
      );

      await waitFor(() => {
        expect(result.current.status).toBe('delegated');
      });

      // Change wallet address (no stored state for new address)
      rerender({ addr: '0xnew-wallet' });
      await waitFor(() => {
        expect(result.current.status).toBe('none');
      });
    });

    it('resets when wallet disconnects (undefined)', () => {
      const { result, rerender } = renderHook(
        ({ addr }) => useTradeCap(BALANCE_MANAGER_ID, addr),
        { initialProps: { addr: WALLET_ADDRESS as string | undefined } }
      );

      rerender({ addr: undefined });
      expect(result.current.status).toBe('none');
      expect(result.current.tradeCapId).toBeNull();
    });
  });
});
