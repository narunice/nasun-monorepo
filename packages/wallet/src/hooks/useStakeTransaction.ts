/**
 * useStakeTransaction Hook
 * Stake and Unstake operations using unified Signer abstraction
 */

import { useState, useCallback } from 'react';
import { useSigner } from './useSigner';
import { useRefreshStaking, useRemoveStakeFromCache } from './useStaking';
import { useRefreshBalance } from './useBalance';
import { getSuiClient, parseAmount, isValidAddress } from '../sui/client';
import { buildStakeTransaction, buildUnstakeTransaction } from '../sui/staking';
import type { StakeRequest, UnstakeRequest, StakeTransactionResult } from '../types/staking';

// Minimum stake amount in NASUN
const MIN_STAKE_NASUN = 1;
const MIN_STAKE_MIST = BigInt(MIN_STAKE_NASUN) * BigInt(1_000_000_000);

// Parse blockchain error messages to user-friendly messages
function parseStakeError(error: string): string {
  // MoveAbort error parsing
  // Format: MoveAbort(..., 10) - abort code is the last number
  const moveAbortMatch = error.match(/MoveAbort\([^)]+,\s*(\d+)\)/);
  if (moveAbortMatch) {
    const abortCode = parseInt(moveAbortMatch[1], 10);

    // validator_set abort codes
    switch (abortCode) {
      case 10:
        return `Minimum stake is ${MIN_STAKE_NASUN} NASUN`;
      case 1:
        return 'Validator not found';
      case 2:
        return 'Insufficient stake balance';
      case 3:
        return 'Stake is still pending activation';
      default:
        return `Staking failed (code: ${abortCode})`;
    }
  }

  // Dry run budget error
  if (error.includes('Dry run failed') && error.includes('MoveAbort')) {
    const innerMatch = error.match(/MoveAbort\([^)]+,\s*(\d+)\)/);
    if (innerMatch) {
      const code = parseInt(innerMatch[1], 10);
      if (code === 10) {
        return `Minimum stake is ${MIN_STAKE_NASUN} NASUN`;
      }
    }
  }

  // Insufficient gas
  if (error.includes('InsufficientGas') || error.includes('insufficient gas')) {
    return 'Insufficient NASUN for gas fees';
  }

  // Insufficient balance
  if (error.includes('InsufficientCoinBalance') || error.includes('insufficient balance')) {
    return 'Insufficient balance';
  }

  return error;
}

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
  const { signer, address, isConnected } = useSigner();
  const refreshStaking = useRefreshStaking();
  const refreshBalance = useRefreshBalance();
  const removeStakeFromCache = useRemoveStakeFromCache();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<StakeTransactionResult | null>(null);

  const stake = useCallback(
    async (request: StakeRequest): Promise<StakeTransactionResult> => {
      // Validate signer state
      if (!signer || !address || !isConnected) {
        const err = 'Wallet is not connected';
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

      // Check minimum stake amount
      if (amountInMist < MIN_STAKE_MIST) {
        const err = `Minimum stake is ${MIN_STAKE_NASUN} NASUN`;
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        const suiClient = getSuiClient();
        const tx = buildStakeTransaction(amountInMist, request.validatorAddress);
        tx.setSender(address);

        // Build and sign transaction
        const txBytes = await tx.build({ client: suiClient });
        const { signature } = await signer.sign(txBytes);

        // Execute transaction
        const result = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
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
        const rawMessage = err instanceof Error ? err.message : 'Stake transaction failed';
        const message = parseStakeError(rawMessage);
        setError(message);
        setIsPending(false);

        const failedResult: StakeTransactionResult = {
          digest: '',
          status: 'failure',
          error: message,
          operationType: 'stake',
        };
        setLastResult(failedResult);

        throw new Error(message);
      }
    },
    [signer, address, isConnected, refreshStaking, refreshBalance]
  );

  const unstake = useCallback(
    async (request: UnstakeRequest): Promise<StakeTransactionResult> => {
      // Validate signer state
      if (!signer || !address || !isConnected) {
        const err = 'Wallet is not connected';
        setError(err);
        throw new Error(err);
      }

      // Validate object ID format
      if (!request.stakedSuiId || !request.stakedSuiId.startsWith('0x')) {
        const err = 'Invalid staked object ID';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        const suiClient = getSuiClient();
        const tx = buildUnstakeTransaction(request.stakedSuiId);
        tx.setSender(address);

        // Build and sign transaction
        const txBytes = await tx.build({ client: suiClient });
        const { signature } = await signer.sign(txBytes);

        // Execute transaction
        const result = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
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

        // Optimistically remove the unstaked position from cache
        // so the UI won't reference a deleted on-chain object
        removeStakeFromCache(request.stakedSuiId);

        // Refresh data from chain
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
    [signer, address, isConnected, refreshStaking, refreshBalance, removeStakeFromCache]
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
