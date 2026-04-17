import { useState, useCallback, useRef } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useQueryClient } from '@tanstack/react-query';
import { buildBuyScratchCard } from '../transactions';
import { getSuiClient } from '../../../lib/sui-client';
import { withTxRetry } from '../../../lib/tx-helpers';
import { parseScratchCardEvent } from '../lib/scratchcard-client';
import { NUSDC_TYPE, CARD_PRICE } from '../constants';
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

  const checkGasBalance = useCallback(async (): Promise<boolean> => {
    if (!walletAddress) return false;
    const client = getSuiClient();
    const balance = await client.getBalance({ owner: walletAddress });
    // Need at least 0.05 NASUN for gas (~50M MIST)
    return BigInt(balance.totalBalance) >= 50_000_000n;
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
      const hasGas = await checkGasBalance();
      if (!hasGas) {
        setError('Not enough NASUN for gas. Request from the faucet first.');
        return null;
      }

      const result = await withTxRetry(async () => {
        const nusdcCoinId = await findNusdcCoin();
        if (!nusdcCoinId) throw new Error('Insufficient NUSDC balance');
        const tx = buildBuyScratchCard(nusdcCoinId);
        return signAndExecute(tx);
      });

      // Parse result from events (showEvents: true)
      const events = (result.events ?? []) as Array<{
        type: string;
        parsedJson: unknown;
      }>;
      const scratchResult = parseScratchCardEvent(events);

      // Wait for RPC to index the transaction, then refetch pool only.
      // Purchase history (my-scratchcards) is NOT refetched here to avoid
      // spoiling the result before the user scratches the card.
      // ScratchCardArea calls refetchHistory() after reveal.
      const client = getSuiClient();
      await client.waitForTransaction({ digest: result.digest, timeout: 10_000 }).catch(() => {});
      await queryClient.refetchQueries({
        queryKey: ['scratchcard-pool'],
        type: 'active',
      });
      queryClient.invalidateQueries({ queryKey: ['game-history'] });

      return scratchResult;
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to buy card';
      let msg = raw;
      if (/ObjectVersionUnavailableForConsumption|not available for consumption/i.test(raw)) {
        msg = 'Network is busy. Please try again in a moment.';
      } else if (/InsufficientGas|No valid gas/i.test(raw)) {
        msg = 'Not enough NASUN for gas. Request from the faucet first.';
      }
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
