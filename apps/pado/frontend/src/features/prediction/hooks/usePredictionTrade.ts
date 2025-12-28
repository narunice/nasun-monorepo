/**
 * usePredictionTrade Hook
 * Handles prediction market trading operations
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import {
  buildMintOutcomeTokensWithAmount,
  buildPlaceBidOrderWithAmount,
  buildPlaceAskOrder,
  buildClaimWinnings,
} from '../transactions';
import { NUSDC_TYPE, NUSDC_DECIMALS } from '../constants';

interface TradeResult {
  success: boolean;
  digest?: string;
  error?: string;
}

interface UsePredictionTradeResult {
  // State
  isLoading: boolean;
  error: string | null;

  // Actions
  mintTokens: (marketId: string, amount: number) => Promise<TradeResult>;
  placeBuyOrder: (marketId: string, isYes: boolean, price: number, amount: number) => Promise<TradeResult>;
  placeSellOrder: (marketId: string, positionId: string, price: number) => Promise<TradeResult>;
  claimWinnings: (marketId: string, positionId: string) => Promise<TradeResult>;
}

export function usePredictionTrade(): UsePredictionTradeResult {
  const { status, account, getKeypair } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sign and execute a transaction
   */
  const signAndExecute = useCallback(async (tx: Transaction) => {
    const keypair = getKeypair();
    if (!keypair) {
      throw new Error('Keypair not available');
    }

    const client = getSuiClient();
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error || 'Transaction failed');
    }

    return result;
  }, [getKeypair]);

  /**
   * Get NUSDC coin with sufficient balance
   */
  const getNusdcCoin = useCallback(async (minAmount: bigint): Promise<string | null> => {
    if (!account) return null;

    const client = getSuiClient();
    const coins = await client.getCoins({
      owner: account.address,
      coinType: NUSDC_TYPE,
    });

    // Find a coin with enough balance
    for (const coin of coins.data) {
      if (BigInt(coin.balance) >= minAmount) {
        return coin.coinObjectId;
      }
    }

    // Try to find total balance across all coins
    const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    if (totalBalance >= minAmount && coins.data.length > 0) {
      // Return the first coin, transaction will need to merge
      return coins.data[0].coinObjectId;
    }

    return null;
  }, [account]);

  /**
   * Mint YES and NO tokens
   */
  const mintTokens = useCallback(async (
    marketId: string,
    amount: number, // In NUSDC (e.g., 100 = 100 NUSDC)
  ): Promise<TradeResult> => {
    if (status !== 'unlocked' || !account) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const amountInUnits = BigInt(Math.floor(amount * Math.pow(10, NUSDC_DECIMALS)));

      const coinId = await getNusdcCoin(amountInUnits);
      if (!coinId) {
        throw new Error('Insufficient NUSDC balance');
      }

      const tx = buildMintOutcomeTokensWithAmount(marketId, coinId, amountInUnits, account.address);
      const result = await signAndExecute(tx);

      return { success: true, digest: result.digest };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mint tokens';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [status, account, signAndExecute, getNusdcCoin]);

  /**
   * Place a buy order for YES or NO tokens
   */
  const placeBuyOrder = useCallback(async (
    marketId: string,
    isYes: boolean,
    price: number, // In percentage (e.g., 65 = 65%)
    amount: number, // In NUSDC
  ): Promise<TradeResult> => {
    if (status !== 'unlocked' || !account) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      // Convert price to basis points (65% -> 6500)
      const priceInBps = Math.floor(price * 100);
      if (priceInBps <= 0 || priceInBps >= 10000) {
        throw new Error('Price must be between 0% and 100%');
      }

      const amountInUnits = BigInt(Math.floor(amount * Math.pow(10, NUSDC_DECIMALS)));

      const coinId = await getNusdcCoin(amountInUnits);
      if (!coinId) {
        throw new Error('Insufficient NUSDC balance');
      }

      const tx = buildPlaceBidOrderWithAmount(marketId, isYes, priceInBps, coinId, amountInUnits);
      const result = await signAndExecute(tx);

      return { success: true, digest: result.digest };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to place order';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [status, account, signAndExecute, getNusdcCoin]);

  /**
   * Place a sell order using a Position NFT
   */
  const placeSellOrder = useCallback(async (
    marketId: string,
    positionId: string,
    price: number, // In percentage
  ): Promise<TradeResult> => {
    if (status !== 'unlocked' || !account) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const priceInBps = Math.floor(price * 100);
      if (priceInBps <= 0 || priceInBps >= 10000) {
        throw new Error('Price must be between 0% and 100%');
      }

      const tx = buildPlaceAskOrder(marketId, positionId, priceInBps);
      const result = await signAndExecute(tx);

      return { success: true, digest: result.digest };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to place sell order';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [status, account, signAndExecute]);

  /**
   * Claim winnings after market resolution
   */
  const claimWinnings = useCallback(async (
    marketId: string,
    positionId: string,
  ): Promise<TradeResult> => {
    if (status !== 'unlocked' || !account) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildClaimWinnings(marketId, positionId);
      const result = await signAndExecute(tx);

      return { success: true, digest: result.digest };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim winnings';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [status, account, signAndExecute]);

  return {
    isLoading,
    error,
    mintTokens,
    placeBuyOrder,
    placeSellOrder,
    claimWinnings,
  };
}
