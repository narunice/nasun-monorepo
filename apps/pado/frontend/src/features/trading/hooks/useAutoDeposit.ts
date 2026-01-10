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
import { useWallet, useZkLogin } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import { useMarket } from '../context/MarketContext';
import { useOpenOrders } from './useOpenOrders';
import { NETWORK_CONFIG } from '../../../config/network';
import type { PoolConfig } from '../types';

export interface AutoDepositResult {
  success: boolean;
  error?: string;
  depositedAmount?: number;
  digest?: string;
}

export interface AutoDepositCheckResult {
  needsDeposit: boolean;
  requiredAmount: number;
  availableInWallet: number;
  availableInBm: number;
  canAfford: boolean;
  shortfall: number;
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

/**
 * Hook for automatic deposit management
 */
export function useAutoDeposit(balanceManagerId: string | null): UseAutoDepositResult {
  const { account, getKeypair, status } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const { currentPool } = useMarket();
  const queryClient = useQueryClient();

  // Get current BM balance
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
  const bmBalance = openOrdersData?.balance ?? { base: 0, quote: 0 };

  const [isDepositing, setIsDepositing] = useState(false);
  const [lastDepositError, setLastDepositError] = useState<string | null>(null);

  // Determine wallet address
  const isLocalWalletActive = status === 'unlocked' && account?.address;
  const walletAddress = isZkLoggedIn ? zkState?.address : (isLocalWalletActive ? account?.address : undefined);

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
          requiredAmount: 0,
          availableInWallet: 0,
          availableInBm: 0,
          canAfford: false,
          shortfall: requiredQuoteAmount,
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
      const canAffordQuote = totalQuoteAvailable >= requiredQuoteAmount;
      const canAffordBase = requiredBaseAmount <= 0 || totalBaseAvailable >= requiredBaseAmount;
      const canAfford = canAffordQuote && canAffordBase;

      return {
        needsDeposit,
        requiredAmount: requiredQuoteAmount,
        availableInWallet: walletQuoteBalance,
        availableInBm: bmQuoteBalance,
        canAfford,
        shortfall: quoteShortfall,
      };
    },
    [walletAddress, currentPool, bmBalance]
  );

  /**
   * Execute transaction helper
   */
  const executeTransaction = useCallback(
    async (tx: Transaction): Promise<{ success: boolean; error?: string; digest?: string }> => {
      const keypair = getKeypair();
      if (!walletAddress) {
        return { success: false, error: 'Wallet not connected' };
      }
      if (!isZkLoggedIn && !keypair) {
        return { success: false, error: 'No signing method available' };
      }

      const client = getSuiClient();

      try {
        tx.setSender(walletAddress);
        const bytes = await tx.build({ client });

        let signature: string;
        if (isZkLoggedIn && zkState) {
          signature = await zkSignTransaction(bytes);
        } else if (keypair) {
          const signResult = await keypair.signTransaction(bytes);
          signature = signResult.signature;
        } else {
          return { success: false, error: 'No signing method available' };
        }

        const result = await client.executeTransactionBlock({
          transactionBlock: bytes,
          signature,
          options: { showEffects: true },
        });

        if (result.effects?.status.status === 'success') {
          return { success: true, digest: result.digest };
        } else {
          return { success: false, error: result.effects?.status.error || 'Transaction failed' };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
      }
    },
    [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction]
  );

  /**
   * Build deposit transaction for exact amount needed
   */
  const buildDepositExactAmount = useCallback(
    async (
      bmId: string,
      quoteAmount: number,
      baseAmount: number = 0,
      pool: PoolConfig
    ): Promise<Transaction | null> => {
      if (!walletAddress) return null;

      const client = getSuiClient();
      const tx = new Transaction();

      // Deposit quote token (NUSDC) if needed
      if (quoteAmount > 0) {
        const rawQuoteAmount = BigInt(Math.ceil(quoteAmount * Math.pow(10, pool.quoteToken.decimals)));

        const quoteCoins = await client.getCoins({
          owner: walletAddress,
          coinType: pool.quoteToken.type!,
        });

        if (quoteCoins.data.length === 0) {
          return null; // No coins available
        }

        // Merge all quote coins and split exact amount
        const coinIds = quoteCoins.data.map(c => c.coinObjectId);
        if (coinIds.length === 1) {
          const [depositCoin] = tx.splitCoins(tx.object(coinIds[0]), [tx.pure.u64(rawQuoteAmount)]);
          tx.moveCall({
            target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
            typeArguments: [pool.quoteToken.type!],
            arguments: [tx.object(bmId), depositCoin],
          });
        } else {
          // Merge all coins first
          const [primary, ...rest] = coinIds;
          tx.mergeCoins(tx.object(primary), rest.map(id => tx.object(id)));
          const [depositCoin] = tx.splitCoins(tx.object(primary), [tx.pure.u64(rawQuoteAmount)]);
          tx.moveCall({
            target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
            typeArguments: [pool.quoteToken.type!],
            arguments: [tx.object(bmId), depositCoin],
          });
        }
      }

      // Deposit base token (NBTC) if needed
      if (baseAmount > 0) {
        const rawBaseAmount = BigInt(Math.ceil(baseAmount * Math.pow(10, pool.baseToken.decimals)));
        const isNativeToken = pool.baseToken.type === '0x2::sui::SUI';

        if (isNativeToken) {
          // For native token, use tx.gas and reserve for gas
          const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(rawBaseAmount)]);
          tx.moveCall({
            target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
            typeArguments: [pool.baseToken.type!],
            arguments: [tx.object(bmId), depositCoin],
          });
        } else {
          const baseCoins = await client.getCoins({
            owner: walletAddress,
            coinType: pool.baseToken.type!,
          });

          if (baseCoins.data.length === 0) {
            return null;
          }

          const coinIds = baseCoins.data.map(c => c.coinObjectId);
          if (coinIds.length === 1) {
            const [depositCoin] = tx.splitCoins(tx.object(coinIds[0]), [tx.pure.u64(rawBaseAmount)]);
            tx.moveCall({
              target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
              typeArguments: [pool.baseToken.type!],
              arguments: [tx.object(bmId), depositCoin],
            });
          } else {
            const [primary, ...rest] = coinIds;
            tx.mergeCoins(tx.object(primary), rest.map(id => tx.object(id)));
            const [depositCoin] = tx.splitCoins(tx.object(primary), [tx.pure.u64(rawBaseAmount)]);
            tx.moveCall({
              target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
              typeArguments: [pool.baseToken.type!],
              arguments: [tx.object(bmId), depositCoin],
            });
          }
        }
      }

      return tx;
    },
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
        return { success: true, depositedAmount: 0 };
      }

      if (!check.canAfford) {
        // Not enough total balance
        const error = `Insufficient balance. Need ${check.shortfall.toFixed(2)} more NUSDC.`;
        setLastDepositError(error);
        return { success: false, error };
      }

      // Execute deposit
      setIsDepositing(true);

      try {
        // Add 5% buffer to avoid rounding issues
        const quoteToDeposit = check.shortfall * 1.05;
        const baseToDeposit = requiredBaseAmount > bmBalance.base
          ? (requiredBaseAmount - bmBalance.base) * 1.05
          : 0;

        const tx = await buildDepositExactAmount(
          balanceManagerId,
          quoteToDeposit,
          baseToDeposit,
          currentPool
        );

        if (!tx) {
          const error = 'Failed to build deposit transaction. Check wallet balance.';
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
            depositedAmount: quoteToDeposit,
            digest: result.digest,
          };
        } else {
          setLastDepositError(result.error || 'Deposit failed');
          return { success: false, error: result.error };
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Deposit failed';
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
      bmBalance,
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
