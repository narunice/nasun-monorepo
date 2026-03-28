import { useState, useCallback, useRef } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useQueryClient } from '@tanstack/react-query';
import { buildPlayGame } from '../transactions';
import { getSuiClient } from '../../../lib/sui-client';
import { parseNumberMatchEvent } from '../lib/numbermatch-client';
import { NUSDC_TYPE, PRICE_PER_PICK } from '../constants';
import type { NumberMatchResult } from '../types';

export interface UseNumberMatchActionsResult {
  playGame: (picks: number[]) => Promise<NumberMatchResult | null>;
  isPlaying: boolean;
  error: string | null;
}

export function useNumberMatchActions(): UseNumberMatchActionsResult {
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

  const [isPlaying, setIsPlaying] = useState(false);
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

  const findNusdcCoin = useCallback(async (requiredAmount: bigint): Promise<string | null> => {
    if (!walletAddress) return null;
    const client = getSuiClient();
    const coins = await client.getCoins({
      owner: walletAddress,
      coinType: NUSDC_TYPE,
    });
    const coin = coins.data.find((c) => BigInt(c.balance) >= requiredAmount);
    return coin?.coinObjectId ?? null;
  }, [walletAddress]);

  const checkGasBalance = useCallback(async (): Promise<boolean> => {
    if (!walletAddress) return false;
    const client = getSuiClient();
    const balance = await client.getBalance({ owner: walletAddress });
    return BigInt(balance.totalBalance) >= 50_000_000n;
  }, [walletAddress]);

  const playGame = useCallback(async (picks: number[]): Promise<NumberMatchResult | null> => {
    if (!isWalletConnected) {
      setError('Wallet not connected');
      return null;
    }

    if (pendingOperationRef.current) {
      setError('Another transaction is in progress');
      return null;
    }
    pendingOperationRef.current = true;

    setIsPlaying(true);
    setError(null);

    try {
      const hasGas = await checkGasBalance();
      if (!hasGas) {
        setError('Not enough NASUN for gas. Request from the faucet first.');
        return null;
      }

      const cost = BigInt(picks.length) * PRICE_PER_PICK;
      const nusdcCoinId = await findNusdcCoin(cost);
      if (!nusdcCoinId) {
        setError(`Insufficient NUSDC balance (need ${Number(cost) / 1_000_000} NUSDC)`);
        return null;
      }

      const tx = buildPlayGame(nusdcCoinId, picks);
      const result = await signAndExecute(tx);

      const events = (result.events ?? []) as Array<{
        type: string;
        parsedJson: unknown;
      }>;
      const gameResult = parseNumberMatchEvent(events);

      // Wait for RPC indexing, then refetch pool
      const client = getSuiClient();
      await client.waitForTransaction({ digest: result.digest, timeout: 10_000 }).catch(() => {});
      await queryClient.refetchQueries({
        queryKey: ['numbermatch-pool'],
        type: 'active',
      });

      return gameResult;
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to play game';
      let msg = raw;
      if (/ObjectVersionUnavailableForConsumption/i.test(raw)) {
        msg = 'Transaction still processing. Please wait a moment and try again.';
      } else if (/InsufficientGas|No valid gas/i.test(raw)) {
        msg = 'Not enough NASUN for gas. Request from the faucet first.';
      }
      console.error('Error playing number match:', err);
      setError(msg);
      return null;
    } finally {
      pendingOperationRef.current = false;
      setIsPlaying(false);
    }
  }, [isWalletConnected, signAndExecute, findNusdcCoin, checkGasBalance, queryClient]);

  return { playGame, isPlaying, error };
}
