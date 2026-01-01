/**
 * useLendingActions Hook
 * Handles deposit and withdraw transactions
 */

import { useState, useCallback } from 'react';
import { useWallet, getSuiClient } from '@nasun/wallet';
import {
  buildDepositTransaction,
  buildWithdrawTransaction,
  buildWithdrawAmountTransaction,
} from '../lib/lending-client';

// NUSDC token type
const NUSDC_TYPE = '0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nusdc::NUSDC';

interface UseLendingActionsResult {
  deposit: (amount: bigint) => Promise<string>;
  withdraw: (positionId: string) => Promise<string>;
  withdrawAmount: (positionId: string, amount: bigint) => Promise<string>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useLendingActions(): UseLendingActionsResult {
  const { account, getKeypair } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Execute a transaction with signing
   */
  const executeTransaction = async (tx: ReturnType<typeof buildDepositTransaction>): Promise<string> => {
    const keypair = getKeypair();
    if (!keypair) {
      throw new Error('Keypair not available');
    }

    const client = getSuiClient();
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error || 'Transaction failed');
    }

    return result.digest;
  };

  /**
   * Find user's NUSDC coins
   */
  const findNusdcCoins = async (): Promise<{ id: string; balance: bigint }[]> => {
    if (!account?.address) return [];

    const client = getSuiClient();
    const response = await client.getCoins({
      owner: account.address,
      coinType: NUSDC_TYPE,
    });

    return response.data.map(coin => ({
      id: coin.coinObjectId,
      balance: BigInt(coin.balance),
    }));
  };

  /**
   * Deposit NUSDC into the lending pool
   */
  const deposit = useCallback(async (amount: bigint): Promise<string> => {
    if (!account?.address) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Find NUSDC coins
      const coins = await findNusdcCoins();
      if (coins.length === 0) {
        throw new Error('No NUSDC balance found');
      }

      // Find coin with enough balance
      const coin = coins.find(c => c.balance >= amount);
      if (!coin) {
        const totalBalance = coins.reduce((sum, c) => sum + c.balance, 0n);
        if (totalBalance < amount) {
          throw new Error(`Insufficient NUSDC balance. Available: ${Number(totalBalance) / 1_000_000}`);
        }
        // TODO: Merge coins if total is enough but no single coin has enough
        throw new Error('Please merge your NUSDC coins first');
      }

      // Build and execute transaction
      const tx = buildDepositTransaction(coin.id, amount);
      const digest = await executeTransaction(tx);

      return digest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [account?.address, getKeypair]);

  /**
   * Withdraw full position from the lending pool
   */
  const withdraw = useCallback(async (positionId: string): Promise<string> => {
    if (!account?.address) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildWithdrawTransaction(positionId);
      const digest = await executeTransaction(tx);

      return digest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [account?.address, getKeypair]);

  /**
   * Withdraw specific amount from position
   */
  const withdrawAmount = useCallback(async (
    positionId: string,
    amount: bigint
  ): Promise<string> => {
    if (!account?.address) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildWithdrawAmountTransaction(positionId, amount);
      const digest = await executeTransaction(tx);

      return digest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [account?.address, getKeypair]);

  return {
    deposit,
    withdraw,
    withdrawAmount,
    isLoading,
    error,
    clearError,
  };
}
