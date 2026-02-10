/**
 * useTradeCap Hook
 *
 * Manages TradeCap delegation to the TP/SL Keeper bot.
 * Flow: mint_trade_cap → transfer to keeper address → keeper can execute orders
 * Revoke: owner calls revoke_trade_cap on BalanceManager (keeper TradeCap becomes invalid)
 */

import { useState, useCallback, useEffect } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useTransactionExecutor } from './useTransactionExecutor';
import { NETWORK_CONFIG } from '../../../config/network';
import { isKeeperConfigured } from '../lib/tpsl-api';

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

export interface UseTradeCapResult {
  status: TradeCapStatus;
  tradeCapId: string | null;
  keeperAddress: string | null;
  isKeeperAvailable: boolean;
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

  // Load stored state on mount / address change
  // Syncing state from localStorage (external system) — setState in effect is intentional
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!walletAddress) {
      setStatus('none');
      setState(null);
      return;
    }
    const stored = getStoredTradeCapState(walletAddress);
    if (stored) {
      setStatus('delegated');
      setState(stored);
    } else {
      setStatus('none');
      setState(null);
    }
  }, [walletAddress]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  // Revoke TradeCap (owner removes from allow list)
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

      return { success: true };
    } catch (err) {
      setStatus('delegated');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }, [balanceManagerId, walletAddress, state, executeTransaction]);

  return {
    status,
    tradeCapId: state?.tradeCapId ?? null,
    keeperAddress: state?.keeperAddress ?? null,
    isKeeperAvailable: isKeeperConfigured() && !!KEEPER_ADDRESS,
    delegate,
    revoke,
  };
}
