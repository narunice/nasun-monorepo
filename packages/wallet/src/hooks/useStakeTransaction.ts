/**
 * useStakeTransaction Hook
 * Stake and Unstake operations
 */

import { useState, useCallback } from 'react';
import { useWallet } from './useWallet';
import { useRefreshStaking } from './useStaking';
import { useRefreshBalance } from './useBalance';
import { getSuiClient, parseAmount, isValidAddress } from '../sui/client';
import { buildStakeTransaction, buildUnstakeTransaction } from '../sui/staking';
import type { StakeRequest, UnstakeRequest, StakeTransactionResult } from '../types/staking';

interface UseStakeTransactionReturn {
  // State
  isPending: boolean;
  error: string | null;
  lastResult: StakeTransactionResult | null;

  // Actions
  stake: (request: StakeRequest) => Promise<StakeTransactionResult>;
  unstake: (request: UnstakeRequest) => Promise<StakeTransactionResult>;
  clearError: () => void;
  clearResult: () => void;
}

export function useStakeTransaction(): UseStakeTransactionReturn {
  const { status, account, getKeypair } = useWallet();
  const refreshStaking = useRefreshStaking();
  const refreshBalance = useRefreshBalance();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<StakeTransactionResult | null>(null);

  const stake = useCallback(
    async (request: StakeRequest): Promise<StakeTransactionResult> => {
      // Validate wallet state
      if (status !== 'unlocked' || !account) {
        const err = 'Wallet is not unlocked';
        setError(err);
        throw new Error(err);
      }

      // Validate validator address
      if (!isValidAddress(request.validatorAddress)) {
        const err = 'Invalid validator address';
        setError(err);
        throw new Error(err);
      }

      // Parse amount (NASUN to MIST)
      const amountInMist = parseAmount(request.amount);
      if (amountInMist <= 0n) {
        const err = 'Invalid amount';
        setError(err);
        throw new Error(err);
      }

      // Get keypair
      const keypair = getKeypair();
      if (!keypair) {
        const err = 'Keypair not available';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        const suiClient = getSuiClient();
        const tx = buildStakeTransaction(amountInMist, request.validatorAddress);

        const result = await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: { showEffects: true },
        });

        const txResult: StakeTransactionResult = {
          digest: result.digest,
          status: result.effects?.status?.status === 'success' ? 'success' : 'failure',
          gasUsed: result.effects?.gasUsed
            ? (
                BigInt(result.effects.gasUsed.computationCost) +
                BigInt(result.effects.gasUsed.storageCost) -
                BigInt(result.effects.gasUsed.storageRebate)
              ).toString()
            : undefined,
          error: result.effects?.status?.error,
          operationType: 'stake',
          amount: request.amount,
        };

        setLastResult(txResult);
        setIsPending(false);

        // Refresh data
        await Promise.all([refreshStaking(), refreshBalance()]);

        return txResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stake transaction failed';
        setError(message);
        setIsPending(false);

        const failedResult: StakeTransactionResult = {
          digest: '',
          status: 'failure',
          error: message,
          operationType: 'stake',
        };
        setLastResult(failedResult);

        throw err;
      }
    },
    [status, account, getKeypair, refreshStaking, refreshBalance]
  );

  const unstake = useCallback(
    async (request: UnstakeRequest): Promise<StakeTransactionResult> => {
      // Validate wallet state
      if (status !== 'unlocked' || !account) {
        const err = 'Wallet is not unlocked';
        setError(err);
        throw new Error(err);
      }

      // Validate object ID format
      if (!request.stakedSuiId || !request.stakedSuiId.startsWith('0x')) {
        const err = 'Invalid staked object ID';
        setError(err);
        throw new Error(err);
      }

      // Get keypair
      const keypair = getKeypair();
      if (!keypair) {
        const err = 'Keypair not available';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        const suiClient = getSuiClient();
        const tx = buildUnstakeTransaction(request.stakedSuiId);

        const result = await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: { showEffects: true },
        });

        const txResult: StakeTransactionResult = {
          digest: result.digest,
          status: result.effects?.status?.status === 'success' ? 'success' : 'failure',
          gasUsed: result.effects?.gasUsed
            ? (
                BigInt(result.effects.gasUsed.computationCost) +
                BigInt(result.effects.gasUsed.storageCost) -
                BigInt(result.effects.gasUsed.storageRebate)
              ).toString()
            : undefined,
          error: result.effects?.status?.error,
          operationType: 'unstake',
        };

        setLastResult(txResult);
        setIsPending(false);

        // Refresh data
        await Promise.all([refreshStaking(), refreshBalance()]);

        return txResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unstake transaction failed';
        setError(message);
        setIsPending(false);

        const failedResult: StakeTransactionResult = {
          digest: '',
          status: 'failure',
          error: message,
          operationType: 'unstake',
        };
        setLastResult(failedResult);

        throw err;
      }
    },
    [status, account, getKeypair, refreshStaking, refreshBalance]
  );

  const clearError = useCallback(() => setError(null), []);
  const clearResult = useCallback(() => setLastResult(null), []);

  return {
    isPending,
    error,
    lastResult,
    stake,
    unstake,
    clearError,
    clearResult,
  };
}
