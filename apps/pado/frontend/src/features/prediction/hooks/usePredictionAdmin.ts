/**
 * Prediction Market Admin Hook (round-6 plan §2.4 + §2.15)
 *
 * Resolves markets and creates new ones via the v1 ABI builders. Builders now
 * take a Transaction as their first arg, so the hook constructs one Transaction
 * per call and pushes the moveCall onto it before signing.
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import { buildResolveMarket, buildCreateMarket } from '../transactions';
import { PREDICTION_ADMIN_CAP, ADMIN_CAP_TYPE } from '../constants';

interface AdminResult {
  success: boolean;
  digest?: string;
  error?: string;
}

const RESOLVER_ADDRESS = import.meta.env.VITE_PREDICTION_RESOLVER_ADDRESS;

if (!RESOLVER_ADDRESS) {
  console.warn('[Security] VITE_PREDICTION_RESOLVER_ADDRESS not configured');
}

function parseAdminError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('ENotResolver') || (message.includes('MoveAbort') && message.includes(', 3)'))) {
    return 'Only the designated resolver can resolve this market';
  }
  if (message.includes('EMarketNotClosed') || (message.includes('MoveAbort') && message.includes(', 1)'))) {
    return 'Market has not reached close time yet';
  }
  if (message.includes('EMarketAlreadyResolved') || (message.includes('MoveAbort') && message.includes(', 2)'))) {
    return 'Market has already been resolved';
  }
  if (message.includes('ECreatorIsResolver') || (message.includes('MoveAbort') && message.includes(', 16)'))) {
    return 'Creator and resolver addresses must differ.';
  }
  if (message.includes('InsufficientGas')) {
    return 'Not enough NSN for transaction fees';
  }
  if (message.length > 100) {
    return 'Transaction failed. Please try again.';
  }
  return message;
}

export function usePredictionAdmin() {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  const isLocalWalletActive = status === 'unlocked' && account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;
  const isWalletConnected = isZkLoggedIn || isLocalWalletActive || isPasskeyUnlocked;

  const isResolver = walletAddress === RESOLVER_ADDRESS;

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
        options: { showEffects: true },
      });

      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error || 'Transaction failed');
      }
      return result;
    },
    [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction, isPasskeyUnlocked, passkeyKeypair],
  );

  const resolveMarket = useCallback(
    async (marketId: string, outcome: boolean): Promise<AdminResult> => {
      if (!isWalletConnected) return { success: false, error: 'Please connect your wallet' };
      if (!isResolver) return { success: false, error: 'Only the designated resolver can resolve markets' };

      setIsLoading(true);
      try {
        const tx = new Transaction();
        buildResolveMarket(tx, marketId, outcome);
        const result = await signAndExecute(tx);
        queryClient.invalidateQueries({ queryKey: ['prediction-markets-with-orderbooks'] });
        queryClient.invalidateQueries({ queryKey: ['prediction', 'market', marketId] });
        return { success: true, digest: result.digest };
      } catch (error) {
        return { success: false, error: parseAdminError(error) };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, isResolver, signAndExecute, queryClient],
  );

  const createMarket = useCallback(
    async (
      question: string,
      description: string,
      category: string,
      resolutionSource: string,
      resolutionCriteria: string,
      closeTime: Date,
      resolveDeadline: Date,
      resolver?: string,
    ): Promise<AdminResult> => {
      if (!isWalletConnected || !walletAddress) {
        return { success: false, error: 'Please connect your wallet' };
      }

      const client = getSuiClient();

      try {
        const adminCapObjects = await client.getOwnedObjects({
          owner: walletAddress,
          filter: { StructType: ADMIN_CAP_TYPE },
        });
        if (adminCapObjects.data.length === 0) {
          return { success: false, error: 'You do not have admin privileges' };
        }

        const rawResolver = resolver ?? walletAddress;
        if (!isValidSuiAddress(rawResolver)) {
          return { success: false, error: 'Invalid resolver address.' };
        }
        // Normalize both sides so equality survives 0x-prefix and leading-zero
        // representational differences (Move ECreatorIsResolver = 16 re-checks
        // on chain, but we want a clear pre-flight error).
        const resolverAddr = normalizeSuiAddress(rawResolver);
        const creatorAddr = normalizeSuiAddress(walletAddress);
        if (resolverAddr === creatorAddr) {
          return {
            success: false,
            error: 'Creator and resolver addresses must differ. Set a separate resolver address.',
          };
        }

        setIsLoading(true);

        const tx = new Transaction();
        buildCreateMarket(
          tx,
          PREDICTION_ADMIN_CAP,
          question,
          description,
          category,
          resolutionSource,
          resolutionCriteria,
          BigInt(closeTime.getTime()),
          BigInt(resolveDeadline.getTime()),
          resolverAddr,
        );

        const result = await signAndExecute(tx);
        queryClient.invalidateQueries({ queryKey: ['prediction-markets-with-orderbooks'] });
        return { success: true, digest: result.digest };
      } catch (error) {
        return { success: false, error: parseAdminError(error) };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, walletAddress, signAndExecute, queryClient],
  );

  return {
    isLoading,
    isResolver,
    resolveMarket,
    createMarket,
  };
}
