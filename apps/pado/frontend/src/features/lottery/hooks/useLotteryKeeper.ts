/**
 * Lottery Keeper Hook
 * For permissionless close/draw actions (anyone can call after time)
 */

import { useState, useCallback } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useQueryClient } from '@tanstack/react-query';
import { getSuiClient } from '../../../lib/sui-client';
import {
  buildCloseRoundPermissionless,
  buildDrawNumbersPermissionless,
} from '../transactions';
import type { LotteryRound } from '../types';
import { ROUND_STATUS } from '../constants';

export interface KeeperResult {
  success: boolean;
  digest?: string;
  error?: string;
}

export interface UseLotteryKeeperResult {
  isLoading: boolean;
  error: string | null;

  // Check if actions are available
  canCloseRound: (round: LotteryRound) => boolean;
  canDrawNumbers: (round: LotteryRound) => boolean;

  // Actions
  closeRound: (roundId: string) => Promise<KeeperResult>;
  drawNumbers: (roundId: string) => Promise<KeeperResult>;
}

function parseKeeperError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Move abort codes -> user-friendly messages
  const errorMap: Record<number, string> = {
    0: 'Round is not open',
    1: 'Round is not closed yet',
    16: 'Close time not reached yet',
    17: 'Draw time not reached yet',
  };

  const codeMatch = message.match(/MoveAbort[^,]*,\s*(\d+)/);
  if (codeMatch) {
    const code = parseInt(codeMatch[1]);
    return errorMap[code] || `Transaction failed (code: ${code})`;
  }

  if (message.includes('InsufficientGas')) {
    return 'Not enough NSN for transaction fees';
  }

  if (message.length > 100) {
    return 'Transaction failed. Please try again.';
  }
  return message;
}

export function useLotteryKeeper(): UseLotteryKeeperResult {
  const { status, account, getKeypair } = useWallet();
  const {
    isConnected: isZkLoggedIn,
    state: zkState,
    signTransaction: zkSignTransaction,
  } = useZkLogin();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine active wallet
  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : undefined;
  const isWalletConnected = isZkLoggedIn || isLocalWalletActive;

  /**
   * Check if round can be closed (permissionless)
   */
  const canCloseRound = useCallback((round: LotteryRound): boolean => {
    return round.status === ROUND_STATUS.OPEN && Date.now() >= round.closeTime;
  }, []);

  /**
   * Check if numbers can be drawn (permissionless)
   */
  const canDrawNumbers = useCallback((round: LotteryRound): boolean => {
    return round.status === ROUND_STATUS.CLOSED && Date.now() >= round.drawTime;
  }, []);

  /**
   * Sign and execute a transaction
   */
  const signAndExecute = useCallback(
    async (tx: ReturnType<typeof buildCloseRoundPermissionless>) => {
      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }

      const client = getSuiClient();
      tx.setSender(walletAddress);
      const bytes = await tx.build({ client });

      let signature: string;
      if (isZkLoggedIn && zkState) {
        signature = await zkSignTransaction(bytes);
      } else {
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
   * Close round (permissionless, after close_time)
   */
  const closeRound = useCallback(
    async (roundId: string): Promise<KeeperResult> => {
      if (!isWalletConnected) {
        return { success: false, error: 'Please connect your wallet' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = buildCloseRoundPermissionless(roundId);
        const result = await signAndExecute(tx);

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['lottery-rounds'] });
        queryClient.invalidateQueries({ queryKey: ['lottery-round', roundId] });

        return { success: true, digest: result.digest };
      } catch (err) {
        const errorMsg = parseKeeperError(err);
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, signAndExecute, queryClient]
  );

  /**
   * Draw numbers (permissionless, after draw_time)
   */
  const drawNumbers = useCallback(
    async (roundId: string): Promise<KeeperResult> => {
      if (!isWalletConnected) {
        return { success: false, error: 'Please connect your wallet' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = buildDrawNumbersPermissionless(roundId);
        const result = await signAndExecute(tx);

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['lottery-rounds'] });
        queryClient.invalidateQueries({ queryKey: ['lottery-round', roundId] });

        return { success: true, digest: result.digest };
      } catch (err) {
        const errorMsg = parseKeeperError(err);
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, signAndExecute, queryClient]
  );

  return {
    isLoading,
    error,
    canCloseRound,
    canDrawNumbers,
    closeRound,
    drawNumbers,
  };
}
