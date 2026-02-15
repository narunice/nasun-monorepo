/**
 * Trading Hook
 * DeepBook V3 order execution - orchestrates transaction execution,
 * balance manager operations, and order placement.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  buildPlaceLimitOrder,
  buildPlaceMarketOrder,
  buildCancelOrder,
  buildCreateBalanceManager,
  buildDeposit,
  buildDepositAll,
  buildWithdrawAll,
  buildDepositExact,
  buildWithdraw,
} from './transactions';
import { buildNbtcFaucetTx, buildNusdcFaucetTx, buildNethFaucetTx, buildNsolFaucetTx } from '@nasun/wallet';
import {
  getStoredBalanceManagerId,
  storeBalanceManagerId,
  clearBalanceManagerId,
} from '../../lib/unified-margin';
import type { PlaceLimitOrderParams, PlaceMarketOrderParams, TradeResult, OrderType } from './types';
import { priceToRaw, quantityToRaw } from '../../lib/deepbook';
import { useMarket } from './context/MarketContext';
import { RPC_SYNC_DELAY_MS } from '../../lib/constants';
import { useTransactionExecutor } from './hooks/useTransactionExecutor';
import { validateBalanceManagerExists, findUserBalanceManager } from './lib/balanceManagerValidation';
import { parseExecutionInfo } from './lib/parseExecutionInfo';

/**
 * Convert a human-readable amount to raw bigint using string manipulation.
 * Avoids float multiplication precision loss (e.g., 0.1 * 10^8 = 10000000.000000001).
 */
function amountToRawBigint(amount: number, decimals: number): bigint {
  if (amount <= 0 || !Number.isFinite(amount)) {
    throw new Error('Amount must be a positive finite number');
  }
  const str = amount.toFixed(decimals);
  const [intPart, fracPart = ''] = str.split('.');
  const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  const raw = BigInt(intPart + paddedFrac);
  if (raw <= 0n) {
    throw new Error('Amount too small for this token');
  }
  return raw;
}

interface UseTrading {
  // State
  isLoading: boolean;
  error: string | null;
  balanceManagerId: string | null;
  isValidatingBalanceManager: boolean;

  // Actions
  createBalanceManager: () => Promise<TradeResult>;
  depositToBalanceManager: (coinId: string, coinType: string) => Promise<TradeResult>;
  placeLimitOrder: (params: PlaceLimitOrderParams) => Promise<TradeResult>;
  placeMarketOrder: (params: PlaceMarketOrderParams) => Promise<TradeResult>;
  cancelOrder: (orderId: string) => Promise<TradeResult>;

  // Convenience orders (for UI)
  placeBuyOrder: (price: number, amount: number, orderType?: OrderType) => Promise<TradeResult>;
  placeSellOrder: (price: number, amount: number, orderType?: OrderType) => Promise<TradeResult>;

  // Token Faucet
  requestNbtc: () => Promise<TradeResult>;
  requestNusdc: () => Promise<TradeResult>;
  requestNeth: () => Promise<TradeResult>;
  requestNsol: () => Promise<TradeResult>;

  // Deposit / Withdraw
  depositAllTokens: () => Promise<TradeResult>;
  withdrawAllTokens: () => Promise<TradeResult>;
  depositToken: (amount: number, coinType: string, decimals: number) => Promise<TradeResult>;
  withdrawToken: (amount: number, coinType: string, decimals: number) => Promise<TradeResult>;
}

export function useTrading(): UseTrading {
  const { currentPool } = useMarket();
  const { isLoading, error, walletAddress, executeTransaction } = useTransactionExecutor();

  const [balanceManagerId, setBalanceManagerId] = useState<string | null>(null);
  const [isValidatingBalanceManager, setIsValidatingBalanceManager] = useState(true);

  // Validate BalanceManager on init and wallet address change
  useEffect(() => {
    const validateAndCleanup = async () => {
      setBalanceManagerId(null);
      setIsValidatingBalanceManager(true);

      if (!walletAddress) {
        setIsValidatingBalanceManager(false);
        return;
      }

      const storedId = getStoredBalanceManagerId(walletAddress);
      if (storedId) {
        const exists = await validateBalanceManagerExists(storedId);
        if (exists) {
          setBalanceManagerId(storedId);
        } else {
          console.warn('[useTrading] Stored BalanceManager does not exist on chain, clearing...');
          clearBalanceManagerId(walletAddress);
        }
      } else {
        // No stored ID — attempt on-chain recovery via event query
        const recoveredId = await findUserBalanceManager(walletAddress);
        if (recoveredId) {
          storeBalanceManagerId(walletAddress, recoveredId);
          setBalanceManagerId(recoveredId);
          console.info('[useTrading] Recovered BalanceManager from on-chain:', recoveredId.slice(0, 16));
        }
      }
      setIsValidatingBalanceManager(false);
    };
    validateAndCleanup();
  }, [walletAddress]);

  // --- Balance Manager Operations ---

  const createBalanceManager = useCallback(async (): Promise<TradeResult> => {
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }

    const tx = buildCreateBalanceManager();
    const result = await executeTransaction(tx);

    if (result.success && result.objectChanges) {
      const created = result.objectChanges.find(
        (change) => change.type === 'created' &&
          change.objectType?.includes('BalanceManager')
      );

      if (created && 'objectId' in created && created.objectId) {
        const managerId = created.objectId;
        storeBalanceManagerId(walletAddress, managerId);
        await new Promise((resolve) => setTimeout(resolve, RPC_SYNC_DELAY_MS));
        setBalanceManagerId(managerId);
        return { success: true, digest: result.digest };
      }
    }

    return result;
  }, [walletAddress, executeTransaction]);

  const depositToBalanceManager = useCallback(async (
    coinId: string,
    coinType: string,
  ): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created' };
    }
    const tx = buildDeposit(balanceManagerId, coinId, coinType);
    return executeTransaction(tx);
  }, [balanceManagerId, executeTransaction]);

  const depositAllTokens = useCallback(async (): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created. Create one first.' };
    }
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }

    const { tx, baseAmount, quoteAmount } = await buildDepositAll(
      balanceManagerId,
      walletAddress,
      currentPool,
    );
    const result = await executeTransaction(tx);

    if (result.success) {
      const baseDecimals = currentPool.baseToken.decimals;
      const quoteDecimals = currentPool.quoteToken.decimals;
      const baseFormatDecimals = baseDecimals > 6 ? 4 : 2;
      const quoteFormatDecimals = quoteDecimals > 4 ? 2 : quoteDecimals;

      return {
        ...result,
        depositInfo: {
          baseAmount: (Number(baseAmount) / Math.pow(10, baseDecimals)).toFixed(baseFormatDecimals),
          quoteAmount: (Number(quoteAmount) / Math.pow(10, quoteDecimals)).toFixed(quoteFormatDecimals),
          baseSymbol: currentPool.baseToken.symbol,
          quoteSymbol: currentPool.quoteToken.symbol,
        },
      };
    }
    return result;
  }, [balanceManagerId, walletAddress, executeTransaction, currentPool]);

  const withdrawAllTokens = useCallback(async (): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created.' };
    }
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }
    const tx = buildWithdrawAll(balanceManagerId, walletAddress, currentPool);
    return executeTransaction(tx);
  }, [balanceManagerId, walletAddress, executeTransaction, currentPool]);

  // --- Order Operations ---

  const placeLimitOrder = useCallback(async (
    params: PlaceLimitOrderParams,
  ): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created. Create one first.' };
    }
    const tx = buildPlaceLimitOrder(balanceManagerId, params, currentPool);
    return executeTransaction(tx);
  }, [balanceManagerId, executeTransaction, currentPool]);

  const placeMarketOrder = useCallback(async (
    params: PlaceMarketOrderParams,
  ): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created. Create one first.' };
    }
    const tx = buildPlaceMarketOrder(balanceManagerId, params, currentPool);
    return executeTransaction(tx);
  }, [balanceManagerId, executeTransaction, currentPool]);

  const cancelOrder = useCallback(async (orderId: string): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created' };
    }
    const tx = buildCancelOrder(balanceManagerId, orderId, currentPool);
    return executeTransaction(tx);
  }, [balanceManagerId, executeTransaction, currentPool]);

  const placeBuyOrder = useCallback(async (
    price: number,
    amount: number,
    orderType?: OrderType,
  ): Promise<TradeResult> => {
    const rawPrice = priceToRaw(price, currentPool.quoteToken.decimals);
    const rawQuantity = quantityToRaw(amount, currentPool.baseToken.decimals);

    const result = await placeLimitOrder({
      price: rawPrice,
      quantity: rawQuantity,
      isBid: true,
      orderType,
    });

    if (result.success && result.events) {
      const executionInfo = parseExecutionInfo(
        result.events, amount, true,
        currentPool.baseToken.decimals, currentPool.quoteToken.decimals
      );
      if (executionInfo) {
        return { ...result, executionInfo };
      }
    }
    return result;
  }, [placeLimitOrder, currentPool]);

  const placeSellOrder = useCallback(async (
    price: number,
    amount: number,
    orderType?: OrderType,
  ): Promise<TradeResult> => {
    const rawPrice = priceToRaw(price, currentPool.quoteToken.decimals);
    const rawQuantity = quantityToRaw(amount, currentPool.baseToken.decimals);

    const result = await placeLimitOrder({
      price: rawPrice,
      quantity: rawQuantity,
      isBid: false,
      orderType,
    });

    if (result.success && result.events) {
      const executionInfo = parseExecutionInfo(
        result.events, amount, false,
        currentPool.baseToken.decimals, currentPool.quoteToken.decimals
      );
      if (executionInfo) {
        return { ...result, executionInfo };
      }
    }
    return result;
  }, [placeLimitOrder, currentPool]);

  // --- Faucet Operations ---

  const requestNbtc = useCallback(async (): Promise<TradeResult> => {
    const tx = buildNbtcFaucetTx();
    return executeTransaction(tx);
  }, [executeTransaction]);

  const requestNusdc = useCallback(async (): Promise<TradeResult> => {
    const tx = buildNusdcFaucetTx();
    return executeTransaction(tx);
  }, [executeTransaction]);

  const requestNeth = useCallback(async (): Promise<TradeResult> => {
    const tx = buildNethFaucetTx();
    return executeTransaction(tx);
  }, [executeTransaction]);

  const requestNsol = useCallback(async (): Promise<TradeResult> => {
    const tx = buildNsolFaucetTx();
    return executeTransaction(tx);
  }, [executeTransaction]);

  // --- Per-Token Deposit/Withdraw ---

  const depositToken = useCallback(async (
    amount: number,
    coinType: string,
    decimals: number,
  ): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created.' };
    }
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }

    const rawAmount = amountToRawBigint(amount, decimals);
    try {
      const tx = await buildDepositExact(balanceManagerId, rawAmount, coinType, walletAddress);
      return executeTransaction(tx);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed';
      return { success: false, error: message };
    }
  }, [balanceManagerId, walletAddress, executeTransaction]);

  const withdrawToken = useCallback(async (
    amount: number,
    coinType: string,
    decimals: number,
  ): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created.' };
    }
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }

    const rawAmount = amountToRawBigint(amount, decimals);
    try {
      const tx = buildWithdraw(balanceManagerId, rawAmount, coinType, walletAddress);
      return executeTransaction(tx);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed';
      return { success: false, error: message };
    }
  }, [balanceManagerId, walletAddress, executeTransaction]);

  return {
    isLoading,
    error,
    balanceManagerId,
    isValidatingBalanceManager,
    createBalanceManager,
    depositToBalanceManager,
    depositToken,
    withdrawToken,
    placeLimitOrder,
    placeMarketOrder,
    cancelOrder,
    placeBuyOrder,
    placeSellOrder,
    requestNbtc,
    requestNusdc,
    requestNeth,
    requestNsol,
    depositAllTokens,
    withdrawAllTokens,
  };
}
