import { useState, useCallback, useRef } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useQueryClient } from '@tanstack/react-query';
import { buildBuyTicket, buildClaimPrize, buildBurnTicket } from '../transactions';
import { getSuiClient } from '../../../lib/sui-client';
import { NUSDC_TYPE, TICKET_PRICE } from '../constants';
import { TX_SYNC_DELAY_MS } from '../../../lib/constants';

export const LOTTERY_PURCHASED_KEY = 'pado:lotteryTicketPurchased';
export const LOTTERY_PURCHASE_EVENT = 'pado:lottery-purchased';

export interface UseLotteryActionsResult {
  buyTicket: (roundId: string, numbers: number[]) => Promise<boolean>;
  claimPrize: (roundId: string, ticketId: string) => Promise<boolean>;
  burnTicket: (roundId: string, ticketId: string) => Promise<boolean>;
  isBuying: boolean;
  isClaiming: boolean;
  error: string | null;
}

export function useLotteryActions(): UseLotteryActionsResult {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const queryClient = useQueryClient();

  // Determine active wallet (zkLogin takes priority)
  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;
  const isWalletConnected = isZkLoggedIn || isLocalWalletActive || isPasskeyUnlocked;

  const [isBuying, setIsBuying] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Security: Reentrancy protection
  const pendingOperationRef = useRef<string | null>(null);

  /**
   * Sign and execute a transaction (supports both local wallet and zkLogin)
   */
  const signAndExecute = useCallback(async (tx: Transaction) => {
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
    } else if (isPasskeyUnlocked && passkeyKeypair) {
      const signResult = await passkeyKeypair.signTransaction(bytes);
      signature = signResult.signature;
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
      options: {
        showEffects: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error || 'Transaction failed');
    }

    return result;
  }, [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction, isPasskeyUnlocked, passkeyKeypair]);

  const findNusdcCoin = useCallback(async (): Promise<string | null> => {
    if (!walletAddress) return null;

    const client = getSuiClient();
    const coins = await client.getCoins({
      owner: walletAddress,
      coinType: NUSDC_TYPE,
    });

    // Find a coin with enough balance
    const suitableCoin = coins.data.find(
      (coin) => BigInt(coin.balance) >= TICKET_PRICE
    );

    return suitableCoin?.coinObjectId || null;
  }, [walletAddress]);

  const buyTicket = useCallback(
    async (roundId: string, numbers: number[]): Promise<boolean> => {
      if (!isWalletConnected) {
        setError('Wallet not connected');
        return false;
      }

      // Security: Reentrancy protection
      const operationKey = `buy:${roundId}`;
      if (pendingOperationRef.current) {
        setError('Another transaction is in progress. Please wait.');
        return false;
      }
      pendingOperationRef.current = operationKey;

      setIsBuying(true);
      setError(null);

      try {
        const nusdcCoinId = await findNusdcCoin();
        if (!nusdcCoinId) {
          setError('Insufficient NUSDC balance');
          return false;
        }

        const tx = buildBuyTicket(roundId, nusdcCoinId, numbers);
        await signAndExecute(tx);

        // Wait for RPC node to update its state after transaction
        await new Promise((resolve) => setTimeout(resolve, TX_SYNC_DELAY_MS));

        // Force refetch all related queries and wait for completion
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['my-lottery-tickets'], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['lottery-round', roundId], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['lottery-rounds'], type: 'active' }),
        ]);
        // Also invalidate inactive queries so they refetch on mount
        queryClient.invalidateQueries({ queryKey: ['lottery-rounds'] });
        queryClient.invalidateQueries({ queryKey: ['lottery-round'] });

        // Mark lottery ticket purchased for Getting Started checklist
        try { localStorage.setItem(LOTTERY_PURCHASED_KEY, String(Date.now())); } catch { /* noop */ }
        document.dispatchEvent(new Event(LOTTERY_PURCHASE_EVENT));

        return true;
      } catch (err) {
        console.error('Error buying ticket:', err);
        setError(err instanceof Error ? err.message : 'Failed to buy ticket');
        return false;
      } finally {
        pendingOperationRef.current = null;
        setIsBuying(false);
      }
    },
    [isWalletConnected, signAndExecute, queryClient, findNusdcCoin]
  );

  const claimPrize = useCallback(
    async (roundId: string, ticketId: string): Promise<boolean> => {
      if (!isWalletConnected) {
        setError('Wallet not connected');
        return false;
      }

      // Security: Reentrancy protection
      const operationKey = `claim:${ticketId}`;
      if (pendingOperationRef.current) {
        setError('Another transaction is in progress. Please wait.');
        return false;
      }
      pendingOperationRef.current = operationKey;

      setIsClaiming(true);
      setError(null);

      try {
        const tx = buildClaimPrize(roundId, ticketId);
        await signAndExecute(tx);

        // Wait for RPC node to update its state after transaction
        await new Promise((resolve) => setTimeout(resolve, TX_SYNC_DELAY_MS));

        // Force refetch all related queries and wait for completion
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['my-lottery-tickets'], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['lottery-round', roundId], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['lottery-rounds'], type: 'active' }),
        ]);
        // Also invalidate inactive queries so they refetch on mount
        queryClient.invalidateQueries({ queryKey: ['lottery-rounds'] });
        queryClient.invalidateQueries({ queryKey: ['lottery-round'] });

        return true;
      } catch (err) {
        console.error('Error claiming prize:', err);
        setError(err instanceof Error ? err.message : 'Failed to claim prize');
        return false;
      } finally {
        pendingOperationRef.current = null;
        setIsClaiming(false);
      }
    },
    [isWalletConnected, signAndExecute, queryClient]
  );

  const burnTicket = useCallback(
    async (roundId: string, ticketId: string): Promise<boolean> => {
      if (!isWalletConnected) {
        setError('Wallet not connected');
        return false;
      }

      // Security: Reentrancy protection
      const operationKey = `burn:${ticketId}`;
      if (pendingOperationRef.current) {
        setError('Another transaction is in progress. Please wait.');
        return false;
      }
      pendingOperationRef.current = operationKey;

      setError(null);

      try {
        const tx = buildBurnTicket(roundId, ticketId);
        await signAndExecute(tx);

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['my-lottery-tickets'] });

        return true;
      } catch (err) {
        console.error('Error burning ticket:', err);
        setError(err instanceof Error ? err.message : 'Failed to burn ticket');
        return false;
      } finally {
        pendingOperationRef.current = null;
      }
    },
    [isWalletConnected, signAndExecute, queryClient]
  );

  return {
    buyTicket,
    claimPrize,
    burnTicket,
    isBuying,
    isClaiming,
    error,
  };
}
