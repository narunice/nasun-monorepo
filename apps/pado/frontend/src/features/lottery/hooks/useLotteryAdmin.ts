/**
 * Lottery Admin Hook
 * For round creation, closing, drawing, and settlement (Admin only)
 */

import { useState, useCallback, useEffect } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useQueryClient } from '@tanstack/react-query';
import { getSuiClient } from '../../../lib/sui-client';
import {
  buildCreateRound,
  buildCloseRound,
  buildDrawNumbers,
  buildSettleRound,
  buildWithdrawTreasury,
} from '../transactions';
import { LOTTERY_PACKAGE_ID } from '../constants';

export interface AdminResult {
  success: boolean;
  digest?: string;
  error?: string;
}

export interface UseLotteryAdminResult {
  isAdmin: boolean;
  isLoading: boolean;
  adminCapId: string | null;
  error: string | null;

  // Actions
  createRound: (
    closeTime: number,
    drawTime: number,
    rollover: bigint
  ) => Promise<AdminResult>;
  closeRound: (roundId: string) => Promise<AdminResult>;
  drawNumbers: (roundId: string) => Promise<AdminResult>;
  settleRound: (
    roundId: string,
    tier1WinnersCount: number,
    tier2WinnersCount: number,
    tier3WinnersCount: number
  ) => Promise<AdminResult>;
  withdrawTreasury: () => Promise<AdminResult>;
}

const ADMIN_CAP_TYPE = `${LOTTERY_PACKAGE_ID}::lottery::AdminCap`;

function parseLotteryAdminError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Move abort codes -> user-friendly messages
  const errorMap: Record<number, string> = {
    0: 'Round is not open for this action',
    1: 'Round is not closed yet',
    2: 'Round is not drawn yet',
    3: 'Round has already been drawn',
    4: 'Round has already been settled',
    5: 'Not enough prize in pool',
    6: 'You do not have admin privileges',
    7: 'Invalid numbers',
    8: 'Ticket limit exceeded',
    9: 'Round is closed',
    10: 'Not a winner',
    11: 'Already claimed',
    12: 'Invalid round',
    13: 'Draw time must be after close time',
    14: 'Close time must be in the future',
    15: 'Round has expired',
  };

  const codeMatch = message.match(/MoveAbort[^,]*,\s*(\d+)/);
  if (codeMatch) {
    const code = parseInt(codeMatch[1]);
    return errorMap[code] || `Transaction failed (code: ${code})`;
  }

  if (message.includes('InsufficientGas')) {
    return 'Not enough NASUN for transaction fees';
  }

  // Return original message for unknown errors (truncated)
  if (message.length > 100) {
    return 'Transaction failed. Please try again.';
  }
  return message;
}

export function useLotteryAdmin(): UseLotteryAdminResult {
  const { status, account, getKeypair } = useWallet();
  const {
    isConnected: isZkLoggedIn,
    state: zkState,
    signTransaction: zkSignTransaction,
  } = useZkLogin();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);
  const [adminCapId, setAdminCapId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Determine active wallet (zkLogin takes priority)
  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : undefined;
  const isWalletConnected = isZkLoggedIn || isLocalWalletActive;

  // Check if user has AdminCap
  useEffect(() => {
    async function checkAdminCap() {
      if (!walletAddress) {
        setAdminCapId(null);
        return;
      }

      try {
        const client = getSuiClient();
        const adminCapObjects = await client.getOwnedObjects({
          owner: walletAddress,
          filter: { StructType: ADMIN_CAP_TYPE },
        });

        if (adminCapObjects.data.length > 0) {
          const capId = adminCapObjects.data[0].data?.objectId || null;
          setAdminCapId(capId);
        } else {
          setAdminCapId(null);
        }
      } catch (err) {
        console.error('Error checking AdminCap:', err);
        setAdminCapId(null);
      }
    }

    checkAdminCap();
  }, [walletAddress]);

  const isAdmin = !!adminCapId;

  /**
   * Sign and execute a transaction (supports both local wallet and zkLogin)
   */
  const signAndExecute = useCallback(
    async (tx: Transaction) => {
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

      return result;
    },
    [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction]
  );

  /**
   * Create a new lottery round
   */
  const createRound = useCallback(
    async (
      closeTime: number,
      drawTime: number,
      rollover: bigint
    ): Promise<AdminResult> => {
      if (!isWalletConnected) {
        return { success: false, error: 'Please connect your wallet' };
      }

      if (!adminCapId) {
        return { success: false, error: 'You do not have admin privileges' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = buildCreateRound(closeTime, drawTime, rollover, adminCapId);
        const result = await signAndExecute(tx);

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['lottery-rounds'] });
        queryClient.invalidateQueries({ queryKey: ['lottery-registry'] });

        return { success: true, digest: result.digest };
      } catch (err) {
        const errorMsg = parseLotteryAdminError(err);
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, adminCapId, signAndExecute, queryClient]
  );

  /**
   * Close a round for ticket sales
   */
  const closeRound = useCallback(
    async (roundId: string): Promise<AdminResult> => {
      if (!isWalletConnected) {
        return { success: false, error: 'Please connect your wallet' };
      }

      if (!adminCapId) {
        return { success: false, error: 'You do not have admin privileges' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = buildCloseRound(roundId, adminCapId);
        const result = await signAndExecute(tx);

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['lottery-rounds'] });
        queryClient.invalidateQueries({ queryKey: ['lottery-round', roundId] });

        return { success: true, digest: result.digest };
      } catch (err) {
        const errorMsg = parseLotteryAdminError(err);
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, adminCapId, signAndExecute, queryClient]
  );

  /**
   * Draw winning numbers
   */
  const drawNumbers = useCallback(
    async (roundId: string): Promise<AdminResult> => {
      if (!isWalletConnected) {
        return { success: false, error: 'Please connect your wallet' };
      }

      if (!adminCapId) {
        return { success: false, error: 'You do not have admin privileges' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = buildDrawNumbers(roundId, adminCapId);
        const result = await signAndExecute(tx);

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['lottery-rounds'] });
        queryClient.invalidateQueries({ queryKey: ['lottery-round', roundId] });

        return { success: true, digest: result.digest };
      } catch (err) {
        const errorMsg = parseLotteryAdminError(err);
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, adminCapId, signAndExecute, queryClient]
  );

  /**
   * Settle a round and distribute prizes (multi-tier)
   */
  const settleRound = useCallback(
    async (
      roundId: string,
      tier1WinnersCount: number,
      tier2WinnersCount: number,
      tier3WinnersCount: number
    ): Promise<AdminResult> => {
      if (!isWalletConnected) {
        return { success: false, error: 'Please connect your wallet' };
      }

      if (!adminCapId) {
        return { success: false, error: 'You do not have admin privileges' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = buildSettleRound(
          roundId,
          tier1WinnersCount,
          tier2WinnersCount,
          tier3WinnersCount,
          adminCapId
        );
        const result = await signAndExecute(tx);

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['lottery-rounds'] });
        queryClient.invalidateQueries({ queryKey: ['lottery-round', roundId] });
        queryClient.invalidateQueries({ queryKey: ['lottery-registry'] });

        return { success: true, digest: result.digest };
      } catch (err) {
        const errorMsg = parseLotteryAdminError(err);
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, adminCapId, signAndExecute, queryClient]
  );

  /**
   * Withdraw treasury balance
   */
  const withdrawTreasury = useCallback(async (): Promise<AdminResult> => {
    if (!isWalletConnected) {
      return { success: false, error: 'Please connect your wallet' };
    }

    if (!adminCapId) {
      return { success: false, error: 'You do not have admin privileges' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildWithdrawTreasury(adminCapId);
      const result = await signAndExecute(tx);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['lottery-registry'] });

      return { success: true, digest: result.digest };
    } catch (err) {
      const errorMsg = parseLotteryAdminError(err);
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, [isWalletConnected, adminCapId, signAndExecute, queryClient]);

  return {
    isAdmin,
    isLoading,
    adminCapId,
    error,
    createRound,
    closeRound,
    drawNumbers,
    settleRound,
    withdrawTreasury,
  };
}
