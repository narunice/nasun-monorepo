/**
 * useLendingActions Hook
 * Handles deposit and withdraw transactions
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, getSuiClient } from '@nasun/wallet';
import {
  buildDepositTransaction,
  buildWithdrawTransaction,
  buildWithdrawAmountTransaction,
} from '../lib/lending-client';

// NUSDC token type (from environment config)
const NUSDC_TYPE = import.meta.env.VITE_NUSDC_TYPE || '0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489::nusdc::NUSDC';

interface UseLendingActionsResult {
  deposit: (amount: bigint) => Promise<string>;
  withdraw: (positionId: string) => Promise<string>;
  withdrawAmount: (positionId: string, amount: bigint) => Promise<string>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useLendingActions(): UseLendingActionsResult {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();

  // Determine active wallet (zkLogin takes priority)
  const isLocalWalletActive = status === 'unlocked' && account?.address;
  const walletAddress = isZkLoggedIn ? zkState?.address : (isLocalWalletActive ? account?.address : undefined);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Sign and execute a transaction (supports both local wallet and zkLogin)
   */
  const signAndExecute = useCallback(async (tx: Transaction): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    const client = getSuiClient();
    tx.setSender(walletAddress);
    const bytes = await tx.build({ client });

    // Sign with appropriate method
    let signature: string;
    if (isZkLoggedIn && zkState) {
      // zkLogin signing
      signature = await zkSignTransaction(bytes);
    } else {
      // Local wallet signing
      const keypair = getKeypair();
      if (!keypair) {
        throw new Error('Keypair not available');
      }
      const signResult = await keypair.signTransaction(bytes);
      signature = signResult.signature;
    }

    const result = await client.executeTransactionBlock({
      transactionBlock: bytes,
      signature,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error || 'Transaction failed');
    }

    return result.digest;
  }, [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction]);

  /**
   * Find user's NUSDC coins
   */
  const findNusdcCoins = useCallback(async (): Promise<{ id: string; balance: bigint }[]> => {
    if (!walletAddress) return [];

    const client = getSuiClient();
    const response = await client.getCoins({
      owner: walletAddress,
      coinType: NUSDC_TYPE,
    });

    return response.data.map(coin => ({
      id: coin.coinObjectId,
      balance: BigInt(coin.balance),
    }));
  }, [walletAddress]);

  /**
   * Deposit NUSDC into the lending pool
   */
  const deposit = useCallback(async (amount: bigint): Promise<string> => {
    if (!walletAddress) {
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
      const digest = await signAndExecute(tx);

      return digest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, findNusdcCoins, signAndExecute]);

  /**
   * Withdraw full position from the lending pool
   */
  const withdraw = useCallback(async (positionId: string): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildWithdrawTransaction(positionId);
      const digest = await signAndExecute(tx);

      return digest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, signAndExecute]);

  /**
   * Withdraw specific amount from position
   */
  const withdrawAmount = useCallback(async (
    positionId: string,
    amount: bigint
  ): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildWithdrawAmountTransaction(positionId, amount);
      const digest = await signAndExecute(tx);

      return digest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, signAndExecute]);

  return {
    deposit,
    withdraw,
    withdrawAmount,
    isLoading,
    error,
    clearError,
  };
}
