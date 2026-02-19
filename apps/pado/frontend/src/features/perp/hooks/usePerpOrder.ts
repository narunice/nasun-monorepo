/**
 * Hook for perpetual position actions (open, close, modify)
 * @module features/perp/hooks/usePerpOrder
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import {
  buildOpenPositionWithAmount,
  buildClosePosition,
  buildAddCollateralWithAmount,
  buildRemoveCollateral,
} from '../transactions';
import { useInvalidatePositions } from './usePerpPositions';
import {
  MIN_POSITION_SIZE,
  MAX_LEVERAGE,
  MIN_LEVERAGE,
  BPS,
  DEFAULT_TAKER_FEE_BPS,
  toContractPrice,
  toContractAmount,
} from '../constants';
import type {
  OpenPositionParams,
  ClosePositionParams,
  AddCollateralParams,
  RemoveCollateralParams,
  OrderPreview,
} from '../types';
import { formatErrorMessage } from '../../trading/utils/errorParser';

const MARKET_QUERY_KEY = 'perp-market';

interface UsePerpOrderOptions {
  /** Market object ID */
  marketId: string;
  /** Callback on successful transaction */
  onSuccess?: (txDigest: string) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

interface TradeResult {
  success: boolean;
  digest?: string;
  error?: string;
}

/**
 * Hook for opening and managing perpetual positions
 */
export function usePerpOrder(options: UsePerpOrderOptions) {
  const { marketId, onSuccess, onError } = options;
  const { account, getKeypair, status } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const invalidatePositions = useInvalidatePositions();
  const queryClient = useQueryClient();

  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isAddingCollateral, setIsAddingCollateral] = useState(false);
  const [isRemovingCollateral, setIsRemovingCollateral] = useState(false);
  const [openError, setOpenError] = useState<Error | null>(null);
  const [closeError, setCloseError] = useState<Error | null>(null);

  // Determine wallet address
  const isLocalWalletActive = status === 'unlocked' && account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  /**
   * Execute transaction with appropriate signing method
   */
  const executeTransaction = useCallback(async (tx: Transaction): Promise<TradeResult> => {
    const keypair = getKeypair();

    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }
    if (!isZkLoggedIn && !isPasskeyUnlocked && !keypair) {
      return { success: false, error: 'No signing method available' };
    }

    const client = getSuiClient();

    try {
      tx.setSender(walletAddress);
      const bytes = await tx.build({ client });

      let signature: string;
      if (isZkLoggedIn && zkState) {
        signature = await zkSignTransaction(bytes);
      } else if (isPasskeyUnlocked && passkeyKeypair) {
        const signatureData = await passkeyKeypair.signTransaction(bytes);
        signature = signatureData.signature;
      } else if (keypair) {
        const signatureData = await keypair.signTransaction(bytes);
        signature = signatureData.signature;
      } else {
        return { success: false, error: 'No signing method available' };
      }

      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      if (!result.effects) {
        return { success: false, error: 'Transaction submitted but status unknown. Check explorer.' };
      }

      const txStatus = result.effects.status?.status;
      if (txStatus !== 'success') {
        const rawError = result.effects.status?.error || 'Transaction failed';
        return { success: false, error: formatErrorMessage(rawError) };
      }

      return { success: true, digest: result.digest };
    } catch (err) {
      return { success: false, error: formatErrorMessage(err) };
    }
  }, [walletAddress, isZkLoggedIn, zkState, zkSignTransaction, getKeypair, isPasskeyUnlocked, passkeyKeypair]);

  /**
   * Get NUSDC coin for collateral
   */
  const getNusdcCoin = useCallback(async (amount: bigint): Promise<string | null> => {
    if (!walletAddress) return null;

    const client = getSuiClient();
    const nusdcType = import.meta.env.VITE_NUSDC_TYPE || '';

    try {
      const coins = await client.getCoins({
        owner: walletAddress,
        coinType: nusdcType,
      });

      // Find a coin with sufficient balance
      for (const coin of coins.data) {
        if (BigInt(coin.balance) >= amount) {
          return coin.coinObjectId;
        }
      }

      // If no single coin has enough, return the first one (splitting will happen in tx)
      if (coins.data.length > 0) {
        const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);
        if (totalBalance >= amount) {
          return coins.data[0].coinObjectId;
        }
      }

      return null;
    } catch {
      return null;
    }
  }, [walletAddress]);

  // Open position
  const openPosition = useCallback(async (params: {
    isLong: boolean;
    size: number;
    leverage: number;
    currentPrice: number;
  }): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    const { isLong, size, leverage, currentPrice } = params;

    if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) {
      throw new Error(`Leverage must be between ${MIN_LEVERAGE}x and ${MAX_LEVERAGE}x`);
    }

    // Include taker fee in collateral (on-chain requires collateral >= margin + fee)
    const requiredMargin = size / leverage;
    const fee = (size * DEFAULT_TAKER_FEE_BPS) / BPS;
    const requiredCollateral = requiredMargin + fee;
    const collateralUnits = toContractAmount(requiredCollateral);

    const nusdcCoinId = await getNusdcCoin(collateralUnits);
    if (!nusdcCoinId) {
      throw new Error('Not enough NUSDC in wallet. Get tokens from Faucet.');
    }

    const sizeUnits = toContractPrice(size / currentPrice);

    if (sizeUnits < BigInt(MIN_POSITION_SIZE)) {
      throw new Error('Position size below minimum');
    }

    const openParams: OpenPositionParams = {
      marketId,
      isLong,
      size: sizeUnits,
      leverage,
      collateralAmount: collateralUnits,
    };

    setIsOpening(true);
    setOpenError(null);

    try {
      const tx = buildOpenPositionWithAmount(openParams, nusdcCoinId);
      const result = await executeTransaction(tx);

      if (!result.success) {
        throw new Error(result.error || 'Transaction failed');
      }

      invalidatePositions();
      queryClient.invalidateQueries({ queryKey: [MARKET_QUERY_KEY, marketId] });
      onSuccess?.(result.digest!);

      return result.digest!;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setOpenError(error);
      onError?.(error);
      throw error;
    } finally {
      setIsOpening(false);
    }
  }, [walletAddress, marketId, executeTransaction, getNusdcCoin, invalidatePositions, queryClient, onSuccess, onError]);

  // Close position
  const closePosition = useCallback(async (params: {
    positionId: string;
    currentPrice: number;
  }): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    const { positionId } = params;

    const closeParams: ClosePositionParams = {
      marketId,
      positionId,
    };

    setIsClosing(true);
    setCloseError(null);

    try {
      const tx = buildClosePosition(closeParams);
      const result = await executeTransaction(tx);

      if (!result.success) {
        throw new Error(result.error || 'Transaction failed');
      }

      invalidatePositions();
      queryClient.invalidateQueries({ queryKey: [MARKET_QUERY_KEY, marketId] });
      onSuccess?.(result.digest!);

      return result.digest!;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setCloseError(error);
      onError?.(error);
      throw error;
    } finally {
      setIsClosing(false);
    }
  }, [walletAddress, marketId, executeTransaction, invalidatePositions, queryClient, onSuccess, onError]);

  // Add collateral
  const addCollateral = useCallback(async (params: {
    positionId: string;
    amount: number;
    currentPrice: number;
  }): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    const { positionId, amount } = params;
    const amountUnits = toContractAmount(amount);

    const nusdcCoinId = await getNusdcCoin(amountUnits);
    if (!nusdcCoinId) {
      throw new Error('Not enough NUSDC in wallet. Get tokens from Faucet.');
    }

    const addParams: AddCollateralParams = {
      marketId,
      positionId,
      amount: amountUnits,
    };

    setIsAddingCollateral(true);

    try {
      const tx = buildAddCollateralWithAmount(addParams, nusdcCoinId);
      const result = await executeTransaction(tx);

      if (!result.success) {
        throw new Error(result.error || 'Transaction failed');
      }

      invalidatePositions();
      onSuccess?.(result.digest!);

      return result.digest!;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      onError?.(error);
      throw error;
    } finally {
      setIsAddingCollateral(false);
    }
  }, [walletAddress, executeTransaction, getNusdcCoin, invalidatePositions, onSuccess, onError]);

  // Remove collateral
  const removeCollateral = useCallback(async (params: {
    positionId: string;
    amount: number;
    currentPrice: number;
  }): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    const { positionId, amount } = params;

    const removeParams: RemoveCollateralParams = {
      marketId,
      positionId,
      amount: toContractAmount(amount),
    };

    setIsRemovingCollateral(true);

    try {
      const tx = buildRemoveCollateral(removeParams);
      const result = await executeTransaction(tx);

      if (!result.success) {
        throw new Error(result.error || 'Transaction failed');
      }

      invalidatePositions();
      onSuccess?.(result.digest!);

      return result.digest!;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      onError?.(error);
      throw error;
    } finally {
      setIsRemovingCollateral(false);
    }
  }, [walletAddress, marketId, executeTransaction, invalidatePositions, onSuccess, onError]);

  // Calculate order preview
  const calculatePreview = useCallback(
    (params: {
      isLong: boolean;
      size: number;
      leverage: number;
      currentPrice: number;
      availableBalance: number;
      takerFeeBps: number;
    }): OrderPreview => {
      const { size, leverage, currentPrice, availableBalance, takerFeeBps } =
        params;
      const errors: string[] = [];

      if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) {
        errors.push(`Leverage must be ${MIN_LEVERAGE}x-${MAX_LEVERAGE}x`);
      }

      const requiredMargin = size / leverage;
      const fee = (size * takerFeeBps) / BPS;

      if (requiredMargin + fee > availableBalance) {
        errors.push('Insufficient balance');
      }

      let liquidationPrice: number;
      if (params.isLong) {
        liquidationPrice = currentPrice * (1 - (1 - 0.025) / leverage);
      } else {
        liquidationPrice = currentPrice * (1 + (1 - 0.025) / leverage);
      }

      // maxSize = availableBalance / (1/leverage + takerFeeBps/BPS)
      const maxSize = (availableBalance * leverage * BPS) / (BPS + leverage * takerFeeBps);

      const minSizeUsd = (MIN_POSITION_SIZE / 100_000_000) * currentPrice;
      if (size < minSizeUsd && size > 0) {
        errors.push(`Minimum size: $${minSizeUsd.toFixed(2)}`);
      }

      return {
        entryPrice: currentPrice,
        notionalValue: size,
        requiredMargin,
        fee,
        liquidationPrice,
        maxSize,
        errors,
      };
    },
    [],
  );

  return {
    openPosition,
    closePosition,
    addCollateral,
    removeCollateral,
    isOpening,
    isClosing,
    isAddingCollateral,
    isRemovingCollateral,
    isSubmitting: isOpening || isClosing || isAddingCollateral || isRemovingCollateral,
    openError,
    closeError,
    calculatePreview,
  };
}
