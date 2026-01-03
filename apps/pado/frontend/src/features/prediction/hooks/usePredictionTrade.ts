/**
 * usePredictionTrade Hook
 * Handles prediction market trading operations
 */

import { useState, useCallback, useRef } from 'react';
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

/**
 * Parse blockchain error into user-friendly message
 */
function parseTradeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Object deleted (already used or transferred)
  if (message.includes('"code":"deleted"') || message.includes('ObjectDeleted')) {
    return 'This position has already been used or sold. Please refresh the page.';
  }

  // Object not found
  if (message.includes('ObjectNotFound') || message.includes('not found')) {
    return 'Position not found. It may have been transferred or used.';
  }

  // Insufficient gas
  if (message.includes('InsufficientGas') || message.includes('insufficient gas')) {
    return 'Not enough NASUN for transaction fees. Please get some from the faucet.';
  }

  // Insufficient balance
  if (message.includes('InsufficientCoinBalance') || message.includes('Insufficient')) {
    return 'Insufficient balance. Please check your NUSDC balance.';
  }

  // Market closed
  if (message.includes('market_closed') || message.includes('EMarketClosed')) {
    return 'This market is closed and no longer accepting orders.';
  }

  // Market not resolved
  if (message.includes('not_resolved') || message.includes('EMarketNotResolved')) {
    return 'Market has not been resolved yet. Please wait for the outcome.';
  }

  // Invalid price
  if (message.includes('invalid_price') || message.includes('EInvalidPrice')) {
    return 'Invalid price. Price must be between 0% and 100%.';
  }

  // Wrong outcome (trying to claim losing position)
  if (message.includes('wrong_outcome') || message.includes('EWrongOutcome')) {
    return 'This position did not win. Only winning positions can be claimed.';
  }

  // MoveAbort with code - parse the actual error code, not package ID digits
  // Error format: "MoveAbort(...) in module::function, X" or "error code: X"
  const errorCodeMatch = message.match(/(?:error[_\s]?code:?\s*|,\s*)(\d+)(?:\s*\)|$)/i);
  const moveAbortMatch = errorCodeMatch || message.match(/MoveAbort[^,]*,\s*(\d+)/);
  if (moveAbortMatch) {
    const code = parseInt(moveAbortMatch[1]);
    // Map error codes from prediction_market.move
    switch (code) {
      case 0: return 'Market is not open for trading.';
      case 1: return 'Market has not closed yet.';
      case 2: return 'Market has already been resolved.';
      case 3: return 'Only the designated resolver can resolve this market.';
      case 4: return 'Market has not been resolved yet.';
      case 5: return 'This position did not win.';
      case 6: return 'Insufficient balance.';
      case 7: return 'Invalid price. Must be between 1% and 99%.';
      case 8: return 'Order not found.';
      case 9: return 'You are not the owner of this order.';
      case 10: return 'Market has expired.';
      case 11: return 'Cannot trade with yourself.';
      default: return `Transaction failed (code: ${code}). Please try again.`;
    }
  }

  // Generic transaction failure
  if (message.includes('Transaction failed')) {
    return 'Transaction failed. Please try again.';
  }

  // Return original if no match (but truncate if too long)
  if (message.length > 100) {
    return 'Transaction failed. Please refresh and try again.';
  }

  return message;
}

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

  // Security: Reentrancy protection - track pending operations
  const pendingOperationRef = useRef<string | null>(null);

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

    // Security: Reentrancy protection
    const operationKey = `mint:${marketId}`;
    if (pendingOperationRef.current) {
      return { success: false, error: 'Another transaction is in progress. Please wait.' };
    }
    pendingOperationRef.current = operationKey;

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
      const message = parseTradeError(err);
      setError(message);
      return { success: false, error: message };
    } finally {
      pendingOperationRef.current = null;
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

    // Security: Reentrancy protection
    const operationKey = `buy:${marketId}:${isYes}`;
    if (pendingOperationRef.current) {
      return { success: false, error: 'Another transaction is in progress. Please wait.' };
    }
    pendingOperationRef.current = operationKey;

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
      const message = parseTradeError(err);
      setError(message);
      return { success: false, error: message };
    } finally {
      pendingOperationRef.current = null;
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

    // Security: Reentrancy protection
    const operationKey = `sell:${positionId}`;
    if (pendingOperationRef.current) {
      return { success: false, error: 'Another transaction is in progress. Please wait.' };
    }
    pendingOperationRef.current = operationKey;

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
      const message = parseTradeError(err);
      setError(message);
      return { success: false, error: message };
    } finally {
      pendingOperationRef.current = null;
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

    // Security: Reentrancy protection
    const operationKey = `claim:${positionId}`;
    if (pendingOperationRef.current) {
      return { success: false, error: 'Another transaction is in progress. Please wait.' };
    }
    pendingOperationRef.current = operationKey;

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildClaimWinnings(marketId, positionId);
      const result = await signAndExecute(tx);

      return { success: true, digest: result.digest };
    } catch (err) {
      const message = parseTradeError(err);
      setError(message);
      return { success: false, error: message };
    } finally {
      pendingOperationRef.current = null;
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
