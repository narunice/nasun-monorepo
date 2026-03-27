import { useState, useCallback, useRef } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useQueryClient } from '@tanstack/react-query';
import { buildBuyScratchCard } from '../transactions';
import { getSuiClient } from '../../../lib/sui-client';
import { parseScratchCardEvent } from '../lib/scratchcard-client';
import { NUSDC_TYPE, CARD_PRICE, TX_SYNC_DELAY_MS } from '../constants';
import type { ScratchResult } from '../types';

export interface UseScratchCardActionsResult {
  buyCard: () => Promise<ScratchResult | null>;
  isBuying: boolean;
  error: string | null;
}

export function useScratchCardActions(): UseScratchCardActionsResult {
  const { status, account, getKeypair } = useWallet();
  const {
    isConnected: isZkLoggedIn,
    state: zkState,
    signTransaction: zkSignTransaction,
  } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const queryClient = useQueryClient();

  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? (passkeyAddress ?? undefined)
        : undefined;
  const isWalletConnected =
    isZkLoggedIn || isLocalWalletActive || isPasskeyUnlocked;

  const [isBuying, setIsBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingOperationRef = useRef(false);

  const signAndExecute = useCallback(
    async (tx: Transaction) => {
      if (!walletAddress) throw new Error('Wallet not connected');

      const client = getSuiClient();
      tx.setSender(walletAddress);
      const bytes = await tx.build({ client });

      let signature: string;
      if (isZkLoggedIn && zkState) {
        signature = await zkSignTransaction(bytes);
      } else if (isPasskeyUnlocked && passkeyKeypair) {
        const signResult = await passkeyKeypair.signTransaction(bytes);
        signature = signResult.signature;
      } else {
        const keypair = getKeypair();
        if (!keypair) throw new Error('Keypair not available');
        const signResult = await keypair.signTransaction(bytes);
        signature = signResult.signature;
      }

      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true, showEvents: true },
      });

      if (result.effects?.status?.status !== 'success') {
        throw new Error(
          result.effects?.status?.error || 'Transaction failed',
        );
      }

      return result;
    },
    [
      walletAddress,
      getKeypair,
      isZkLoggedIn,
      zkState,
      zkSignTransaction,
      isPasskeyUnlocked,
      passkeyKeypair,
    ],
  );

  const findNusdcCoin = useCallback(async (): Promise<string | null> => {
    if (!walletAddress) return null;
    const client = getSuiClient();
    const coins = await client.getCoins({
      owner: walletAddress,
      coinType: NUSDC_TYPE,
    });
    const coin = coins.data.find((c) => BigInt(c.balance) >= CARD_PRICE);
    return coin?.coinObjectId ?? null;
  }, [walletAddress]);

  const buyCard = useCallback(async (): Promise<ScratchResult | null> => {
    if (!isWalletConnected) {
      setError('Wallet not connected');
      return null;
    }

    if (pendingOperationRef.current) {
      setError('Another transaction is in progress');
      return null;
    }
    pendingOperationRef.current = true;

    setIsBuying(true);
    setError(null);

    try {
      const nusdcCoinId = await findNusdcCoin();
      if (!nusdcCoinId) {
        setError('Insufficient NUSDC balance');
        return null;
      }

      const tx = buildBuyScratchCard(nusdcCoinId);
      const result = await signAndExecute(tx);

      // Parse result from events (showEvents: true)
      const events = (result.events ?? []) as Array<{
        type: string;
        parsedJson: unknown;
      }>;
      const scratchResult = parseScratchCardEvent(events);

      // Wait for RPC indexing then refetch
      await new Promise((resolve) => setTimeout(resolve, TX_SYNC_DELAY_MS));
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: ['scratchcard-pool'],
          type: 'active',
        }),
        queryClient.refetchQueries({
          queryKey: ['my-scratchcards'],
          type: 'active',
        }),
      ]);

      return scratchResult;
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to buy card';
      const msg = /InsufficientGas|No valid gas/i.test(raw)
        ? 'Not enough NASUN for gas. Request NASUN from the faucet first.'
        : raw;
      console.error('Error buying scratch card:', err);
      setError(msg);
      return null;
    } finally {
      pendingOperationRef.current = false;
      setIsBuying(false);
    }
  }, [isWalletConnected, signAndExecute, findNusdcCoin, queryClient]);

  return { buyCard, isBuying, error };
}
