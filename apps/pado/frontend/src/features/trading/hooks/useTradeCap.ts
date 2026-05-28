/**
 * useTradeCap Hook
 *
 * Manages TradeCap delegation to the TP/SL Keeper bot.
 * Flow: mint_trade_cap → transfer to keeper address → keeper can execute orders
 * Revoke: owner calls revoke_trade_cap on BalanceManager (keeper TradeCap becomes invalid)
 *
 * On-chain validation: verifies TradeCap exists AND is owned by keeper when loading from localStorage.
 * Keeper address change detection: fast-path clear when stored keeperAddress differs from current config.
 * Revoke cleanup: cancels all active keeper orders after revoking TradeCap.
 */

import { useState, useCallback, useEffect } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useTransactionExecutor } from './useTransactionExecutor';
import { NETWORK_CONFIG } from '../../../config/network';
import { getSuiClient } from '../../../lib/sui-client';
import {
  isKeeperConfigured,
  getUserTPSLOrders,
  cancelTPSLOrder as cancelTPSLOrderKeeper,
} from '../lib/tpsl-api';

export type TradeCapStatus = 'none' | 'delegated' | 'loading';

interface TradeCapState {
  tradeCapId: string;
  keeperAddress: string;
  delegatedAt: number;
}

const STORAGE_KEY_PREFIX = 'pado:tradecap:';

function getStorageKey(walletAddress: string): string {
  return `${STORAGE_KEY_PREFIX}${walletAddress}`;
}

function getStoredTradeCapState(walletAddress: string): TradeCapState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Runtime shape validation
    if (
      typeof parsed?.tradeCapId === 'string' &&
      typeof parsed?.keeperAddress === 'string' &&
      typeof parsed?.delegatedAt === 'number'
    ) {
      return parsed as TradeCapState;
    }
    return null;
  } catch {
    return null;
  }
}

function storeTradeCapState(walletAddress: string, state: TradeCapState): void {
  try {
    localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(state));
  } catch {
    console.error('Failed to store TradeCap state');
  }
}

function clearTradeCapState(walletAddress: string): void {
  try {
    localStorage.removeItem(getStorageKey(walletAddress));
  } catch {
    console.error('Failed to clear TradeCap state');
  }
}

type TradeCapVerifyResult = 'valid' | 'not_found' | 'wrong_owner' | 'network_error';

/**
 * Verify TradeCap exists on-chain AND is owned by the expected keeper address.
 * Returns a discriminated result so callers can distinguish definitive failures
 * (clear state) from transient network errors (preserve state).
 */
async function verifyTradeCapOnChain(
  tradeCapId: string,
  expectedOwner: string,
): Promise<TradeCapVerifyResult> {
  try {
    const client = getSuiClient();
    const obj = await client.getObject({ id: tradeCapId, options: { showOwner: true } });

    if (obj.error || !obj.data) return 'not_found';

    const owner = obj.data.owner;
    if (
      typeof owner === 'object' &&
      owner !== null &&
      'AddressOwner' in owner &&
      (owner as { AddressOwner: string }).AddressOwner === expectedOwner
    ) {
      return 'valid';
    }

    return 'wrong_owner';
  } catch {
    return 'network_error';
  }
}

export type TradeCapResetReason = 'keeper_changed' | 'invalid_tradecap' | null;

export interface UseTradeCapResult {
  status: TradeCapStatus;
  tradeCapId: string | null;
  keeperAddress: string | null;
  isKeeperAvailable: boolean;
  /** Non-null when delegation was auto-cleared. Consumer should show toast and call clearResetReason(). */
  resetReason: TradeCapResetReason;
  clearResetReason: () => void;
  delegate: () => Promise<{ success: boolean; error?: string }>;
  revoke: () => Promise<{ success: boolean; error?: string }>;
}

const KEEPER_ADDRESS = import.meta.env.VITE_TPSL_KEEPER_ADDRESS || '';
const DEEPBOOK_PACKAGE = NETWORK_CONFIG.deepbookPackage;

export function useTradeCap(
  balanceManagerId: string | null,
  walletAddress: string | undefined
): UseTradeCapResult {
  const { executeTransaction } = useTransactionExecutor();
  const [status, setStatus] = useState<TradeCapStatus>('none');
  const [state, setState] = useState<TradeCapState | null>(null);
  const [resetReason, setResetReason] = useState<TradeCapResetReason>(null);

  // Load stored state on mount / address change, with on-chain verification (P2-1)
  // Syncing state from localStorage (external system) — setState in effect is intentional
  useEffect(() => {
    if (!walletAddress) {
      setStatus('none');
      setState(null);
      return;
    }

    let cancelled = false;

    const loadAndVerify = async () => {
      const stored = getStoredTradeCapState(walletAddress);
      if (!stored) {
        if (!cancelled) {
          setStatus('none');
          setState(null);
        }
        return;
      }

      // Fast-path: detect keeper address change without RPC call
      if (KEEPER_ADDRESS && stored.keeperAddress !== KEEPER_ADDRESS) {
        console.warn('[TradeCap] Keeper address changed, clearing stale delegation');
        clearTradeCapState(walletAddress);
        if (!cancelled) {
          setStatus('none');
          setState(null);
          setResetReason('keeper_changed');
        }
        return;
      }

      // Skip on-chain verification when keeper address is not configured
      if (!KEEPER_ADDRESS) {
        if (!cancelled) {
          setStatus('delegated');
          setState(stored);
        }
        return;
      }

      // Verify TradeCap ownership on-chain
      const result = await verifyTradeCapOnChain(stored.tradeCapId, KEEPER_ADDRESS);
      if (cancelled) return;

      if (result === 'valid') {
        setStatus('delegated');
        setState(stored);
      } else if (result === 'network_error') {
        // Transient failure — preserve state to avoid unnecessary re-delegation
        setStatus('delegated');
        setState(stored);
      } else {
        // not_found or wrong_owner — clear stale state
        clearTradeCapState(walletAddress);
        setStatus('none');
        setState(null);
        setResetReason('invalid_tradecap');
      }
    };

    loadAndVerify();
    return () => { cancelled = true; };
  }, [walletAddress]);

  // Mint TradeCap and transfer to keeper
  const delegate = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!balanceManagerId || !walletAddress || !KEEPER_ADDRESS || !DEEPBOOK_PACKAGE) {
      return { success: false, error: 'Missing configuration (BalanceManager, Keeper address, or DeepBook package)' };
    }

    setStatus('loading');

    try {
      const tx = new Transaction();

      // Step 1: Mint TradeCap from BalanceManager
      const [tradeCap] = tx.moveCall({
        target: `${DEEPBOOK_PACKAGE}::balance_manager::mint_trade_cap`,
        arguments: [tx.object(balanceManagerId)],
      });

      // Step 2: Transfer TradeCap to keeper address
      tx.transferObjects([tradeCap], KEEPER_ADDRESS);

      const result = await executeTransaction(tx);

      if (!result.success) {
        setStatus('none');
        return { success: false, error: result.error || 'Transaction failed' };
      }

      // Extract TradeCap object ID from created objects
      const tradeCapObject = result.objectChanges?.find(
        (change) =>
          change.type === 'created' &&
          change.objectType?.includes('::balance_manager::TradeCap')
      );

      const tradeCapId = tradeCapObject && 'objectId' in tradeCapObject
        ? tradeCapObject.objectId
        : '';

      if (!tradeCapId) {
        setStatus('none');
        return { success: false, error: 'TradeCap created but ID not found in transaction result' };
      }

      const newState: TradeCapState = {
        tradeCapId,
        keeperAddress: KEEPER_ADDRESS,
        delegatedAt: Date.now(),
      };

      storeTradeCapState(walletAddress, newState);
      setState(newState);
      setStatus('delegated');

      return { success: true };
    } catch (err) {
      setStatus('none');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }, [balanceManagerId, walletAddress, executeTransaction]);

  // Revoke TradeCap (owner removes from allow list) + cancel keeper orders (P2-2)
  const revoke = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!balanceManagerId || !walletAddress || !state?.tradeCapId || !DEEPBOOK_PACKAGE) {
      return { success: false, error: 'No TradeCap delegated or missing configuration' };
    }

    setStatus('loading');

    try {
      const tx = new Transaction();

      // revoke_trade_cap removes the TradeCap ID from the allow list
      tx.moveCall({
        target: `${DEEPBOOK_PACKAGE}::balance_manager::revoke_trade_cap`,
        arguments: [
          tx.object(balanceManagerId),
          tx.pure.id(state.tradeCapId),
        ],
      });

      const result = await executeTransaction(tx);

      if (!result.success) {
        setStatus('delegated');
        return { success: false, error: result.error || 'Revoke failed' };
      }

      clearTradeCapState(walletAddress);
      setState(null);
      setStatus('none');

      // Cancel all active keeper orders (non-blocking, best-effort)
      if (isKeeperConfigured()) {
        try {
          const orders = await getUserTPSLOrders(walletAddress);
          const activeOrders = orders.filter((o) => o.status === 'active');
          if (activeOrders.length > 0) {
            await Promise.allSettled(
              activeOrders.map((o) => cancelTPSLOrderKeeper(o.id, walletAddress))
            );
          }
        } catch {
          // Non-critical: keeper orders become non-executable after revoke anyway
        }
      }

      return { success: true };
    } catch (err) {
      setStatus('delegated');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }, [balanceManagerId, walletAddress, state, executeTransaction]);

  const clearResetReason = useCallback(() => setResetReason(null), []);

  return {
    status,
    tradeCapId: state?.tradeCapId ?? null,
    keeperAddress: state?.keeperAddress ?? null,
    isKeeperAvailable: isKeeperConfigured() && !!KEEPER_ADDRESS,
    resetReason,
    clearResetReason,
    delegate,
    revoke,
  };
}
