/**
 * useAutoDeposit Hook
 *
 * Automatic deposit for trading - checks if BalanceManager has enough balance
 * and deposits from wallet if needed.
 *
 * Phase 16.1 v1 Safe Mode:
 * - Pre-check: BM balance >= required?
 * - Yes: Proceed directly to trade
 * - No: Deposit TX first, then Trade TX (separate transactions)
 *
 * @version 1.0.0
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import type { CoinStruct } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import { useMarket } from '../context/MarketContext';
import { useBalanceManagerBalance } from './useBalanceManagerBalance';
import { useTransactionExecutor } from './useTransactionExecutor';
import { NETWORK_CONFIG } from '../../../config/network';
import { DEPOSIT_BUFFER_MULTIPLIER } from '../../../lib/constants';
import type { PoolConfig } from '../types';

export interface AutoDepositResult {
  success: boolean;
  error?: string;
  depositedQuoteAmount?: number;
  depositedBaseAmount?: number;
  digest?: string;
}

export interface AutoDepositCheckResult {
  needsDeposit: boolean;
  // Quote token info (NUSDC)
  requiredQuoteAmount: number;
  availableQuoteInWallet: number;
  availableQuoteInBm: number;
  quoteShortfall: number;
  canAffordQuote: boolean;
  needsQuoteDeposit: boolean;
  // Base token info (NBTC)
  requiredBaseAmount: number;
  availableBaseInWallet: number;
  availableBaseInBm: number;
  baseShortfall: number;
  canAffordBase: boolean;
  needsBaseDeposit: boolean;
  // Combined
  canAfford: boolean;
}

export interface UseAutoDepositResult {
  // Check if deposit is needed
  checkDepositNeeded: (
    requiredQuoteAmount: number,
    requiredBaseAmount?: number
  ) => Promise<AutoDepositCheckResult>;

  // Execute deposit if needed
  depositIfNeeded: (
    requiredQuoteAmount: number,
    requiredBaseAmount?: number
  ) => Promise<AutoDepositResult>;

  // State
  isDepositing: boolean;
  lastDepositError: string | null;
}

// ========================================
// Transaction Builder (standalone, no React dependency)
// ========================================

/**
 * Add a coin deposit to a transaction.
 * Handles coin merging, splitting, and the DeepBook balance_manager::deposit call.
 */
function addCoinDeposit(
  tx: Transaction,
  coins: CoinStruct[],
  rawAmount: bigint,
  coinType: string,
  bmId: string,
  useGas: boolean,
): void {
  const depositTarget = `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`;

  if (useGas) {
    const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(rawAmount)]);
    tx.moveCall({
      target: depositTarget,
      typeArguments: [coinType],
      arguments: [tx.object(bmId), depositCoin],
    });
    return;
  }

  if (coins.length === 0) {
    throw new Error(`No ${coinType} coins available for deposit`);
  }

  const coinIds = coins.map(c => c.coinObjectId);
  const [primary, ...rest] = coinIds;
  if (rest.length > 0) {
    tx.mergeCoins(tx.object(primary), rest.map(id => tx.object(id)));
  }
  const [depositCoin] = tx.splitCoins(tx.object(primary), [tx.pure.u64(rawAmount)]);
  tx.moveCall({
    target: depositTarget,
    typeArguments: [coinType],
    arguments: [tx.object(bmId), depositCoin],
  });
}

/**
 * Build a deposit transaction for the exact amounts needed.
 * Pure function — no React hooks, can be tested independently.
 */
async function buildDepositTransaction(
  walletAddress: string,
  bmId: string,
  quoteAmount: number,
  baseAmount: number,
  pool: PoolConfig,
): Promise<Transaction | null> {
  const client = getSuiClient();
  const tx = new Transaction();

  if (quoteAmount > 0) {
    const rawAmount = BigInt(Math.ceil(quoteAmount * Math.pow(10, pool.quoteToken.decimals)));
    const quoteCoins = await client.getCoins({ owner: walletAddress, coinType: pool.quoteToken.type! });
    if (quoteCoins.data.length === 0) return null;
    addCoinDeposit(tx, quoteCoins.data, rawAmount, pool.quoteToken.type!, bmId, false);
  }

  if (baseAmount > 0) {
    const rawAmount = BigInt(Math.ceil(baseAmount * Math.pow(10, pool.baseToken.decimals)));
    const isNativeToken = pool.baseToken.type === '0x2::sui::SUI';

    if (isNativeToken) {
      addCoinDeposit(tx, [], rawAmount, pool.baseToken.type!, bmId, true);
    } else {
      const baseCoins = await client.getCoins({ owner: walletAddress, coinType: pool.baseToken.type! });
      if (baseCoins.data.length === 0) return null;
      addCoinDeposit(tx, baseCoins.data, rawAmount, pool.baseToken.type!, bmId, false);
    }
  }

  return tx;
}

// ========================================
// React Hook
// ========================================

/**
 * Hook for automatic deposit management
 */
export function useAutoDeposit(balanceManagerId: string | null): UseAutoDepositResult {
  const { executeTransaction, walletAddress } = useTransactionExecutor();
  const { currentPool } = useMarket();
  const queryClient = useQueryClient();

  // Get current BM balance (pass validated ID to avoid stale localStorage reads)
  const { balance: bmBalanceData } = useBalanceManagerBalance({ balanceManagerId });
  const bmBalance = bmBalanceData ?? { base: 0, quote: 0 };

  const [isDepositing, setIsDepositing] = useState(false);
  const [lastDepositError, setLastDepositError] = useState<string | null>(null);

  /**
   * Check if deposit is needed for a trade
   */
  const checkDepositNeeded = useCallback(
    async (
      requiredQuoteAmount: number,
      requiredBaseAmount: number = 0
    ): Promise<AutoDepositCheckResult> => {
      if (!walletAddress) {
        return {
          needsDeposit: false,
          // Quote token info
          requiredQuoteAmount,
          availableQuoteInWallet: 0,
          availableQuoteInBm: 0,
          quoteShortfall: requiredQuoteAmount,
          canAffordQuote: false,
          needsQuoteDeposit: requiredQuoteAmount > 0,
          // Base token info
          requiredBaseAmount,
          availableBaseInWallet: 0,
          availableBaseInBm: 0,
          baseShortfall: requiredBaseAmount,
          canAffordBase: false,
          needsBaseDeposit: requiredBaseAmount > 0,
          // Combined
          canAfford: false,
        };
      }

      const client = getSuiClient();

      // Get wallet balance for quote token (NUSDC)
      const quoteCoins = await client.getCoins({
        owner: walletAddress,
        coinType: currentPool.quoteToken.type!,
      });
      const walletQuoteBalance = quoteCoins.data.reduce(
        (sum, coin) => sum + Number(coin.balance),
        0
      ) / Math.pow(10, currentPool.quoteToken.decimals);

      // Get wallet balance for base token (if needed)
      let walletBaseBalance = 0;
      if (requiredBaseAmount > 0) {
        const baseCoins = await client.getCoins({
          owner: walletAddress,
          coinType: currentPool.baseToken.type!,
        });
        walletBaseBalance = baseCoins.data.reduce(
          (sum, coin) => sum + Number(coin.balance),
          0
        ) / Math.pow(10, currentPool.baseToken.decimals);
      }

      // Check quote token (NUSDC) - most common case for buy orders
      const bmQuoteBalance = bmBalance.quote;
      const quoteShortfall = Math.max(0, requiredQuoteAmount - bmQuoteBalance);
      const totalQuoteAvailable = bmQuoteBalance + walletQuoteBalance;

      // Check base token (NBTC) - for sell orders
      const bmBaseBalance = bmBalance.base;
      const baseShortfall = Math.max(0, requiredBaseAmount - bmBaseBalance);
      const totalBaseAvailable = bmBaseBalance + walletBaseBalance;

      // Determine if we need to deposit
      const needsQuoteDeposit = quoteShortfall > 0;
      const needsBaseDeposit = baseShortfall > 0 && requiredBaseAmount > 0;
      const needsDeposit = needsQuoteDeposit || needsBaseDeposit;

      // Can we afford the trade with wallet + BM combined?
      const canAffordQuote = requiredQuoteAmount <= 0 || totalQuoteAvailable >= requiredQuoteAmount;
      const canAffordBase = requiredBaseAmount <= 0 || totalBaseAvailable >= requiredBaseAmount;
      const canAfford = canAffordQuote && canAffordBase;

      return {
        needsDeposit,
        // Quote token info
        requiredQuoteAmount,
        availableQuoteInWallet: walletQuoteBalance,
        availableQuoteInBm: bmQuoteBalance,
        quoteShortfall,
        canAffordQuote,
        needsQuoteDeposit,
        // Base token info
        requiredBaseAmount,
        availableBaseInWallet: walletBaseBalance,
        availableBaseInBm: bmBaseBalance,
        baseShortfall,
        canAffordBase,
        needsBaseDeposit,
        // Combined
        canAfford,
      };
    },
    [walletAddress, currentPool, bmBalance]
  );

  /**
   * Build deposit transaction (thin wrapper around standalone builder)
   */
  const buildDepositExactAmount = useCallback(
    (bmId: string, quoteAmount: number, baseAmount: number = 0, pool: PoolConfig) =>
      walletAddress
        ? buildDepositTransaction(walletAddress, bmId, quoteAmount, baseAmount, pool)
        : Promise.resolve(null),
    [walletAddress]
  );

  /**
   * Deposit if needed for a trade
   */
  const depositIfNeeded = useCallback(
    async (
      requiredQuoteAmount: number,
      requiredBaseAmount: number = 0
    ): Promise<AutoDepositResult> => {
      setLastDepositError(null);

      if (!balanceManagerId) {
        return { success: false, error: 'No BalanceManager. Enable Trading first.' };
      }

      // Check if deposit is needed
      const check = await checkDepositNeeded(requiredQuoteAmount, requiredBaseAmount);

      if (!check.needsDeposit) {
        // BM has enough balance, no deposit needed
        return { success: true, depositedQuoteAmount: 0, depositedBaseAmount: 0 };
      }

      if (!check.canAfford) {
        // Not enough total balance - show correct token name with Faucet guidance
        let error = '';
        if (!check.canAffordQuote && check.requiredQuoteAmount > 0) {
          error = `Not enough NUSDC. Get ${check.quoteShortfall.toFixed(2)} more from Faucet in your wallet.`;
        } else if (!check.canAffordBase && check.requiredBaseAmount > 0) {
          error = `Not enough ${currentPool.baseToken.symbol}. Get ${check.baseShortfall.toFixed(4)} more from Faucet in your wallet.`;
        } else {
          error = 'Not enough balance. Use Faucet in your wallet to get tokens.';
        }
        setLastDepositError(error);
        return { success: false, error };
      }

      // Execute deposit
      setIsDepositing(true);

      try {
        // Add buffer to avoid rounding issues
        const quoteToDeposit = check.quoteShortfall > 0 ? check.quoteShortfall * DEPOSIT_BUFFER_MULTIPLIER : 0;
        const baseToDeposit = check.baseShortfall > 0 ? check.baseShortfall * DEPOSIT_BUFFER_MULTIPLIER : 0;

        const tx = await buildDepositExactAmount(
          balanceManagerId,
          quoteToDeposit,
          baseToDeposit,
          currentPool
        );

        if (!tx) {
          const missingToken = check.needsQuoteDeposit
            ? currentPool.quoteToken.symbol
            : currentPool.baseToken.symbol;
          const error = `No ${missingToken} in wallet. Get tokens from Faucet.`;
          setLastDepositError(error);
          return { success: false, error };
        }

        const result = await executeTransaction(tx);

        if (result.success) {
          // Refresh balance data
          queryClient.invalidateQueries({ queryKey: ['openOrders'] });
          queryClient.invalidateQueries({ queryKey: ['multi-balance'] });

          return {
            success: true,
            depositedQuoteAmount: quoteToDeposit > 0 ? quoteToDeposit : undefined,
            depositedBaseAmount: baseToDeposit > 0 ? baseToDeposit : undefined,
            digest: result.digest,
          };
        } else {
          setLastDepositError(result.error || 'Deposit failed');
          return { success: false, error: result.error };
        }
      } catch (err) {
        const { formatErrorMessage } = await import('../utils/errorParser');
        const error = formatErrorMessage(err);
        setLastDepositError(error);
        return { success: false, error };
      } finally {
        setIsDepositing(false);
      }
    },
    [
      balanceManagerId,
      checkDepositNeeded,
      buildDepositExactAmount,
      executeTransaction,
      currentPool,
      queryClient,
    ]
  );

  return {
    checkDepositNeeded,
    depositIfNeeded,
    isDepositing,
    lastDepositError,
  };
}
