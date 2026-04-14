/**
 * useMarginAccount
 *
 * React hook for Unified Margin account management
 * Handles account creation, deposit, withdraw operations
 *
 * @version 0.1.0
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet, useZkLogin, usePasskeyStore, getSuiClient } from '@nasun/wallet';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { SuiObjectChange } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
  getMarginAccount,
  findUserMarginAccount,
  getStoredMarginAccountId,
  storeMarginAccountId,
  buildCreateAccountTx,
  buildDepositWithSplitTx,
  buildWithdrawTx,
  buildWithdrawAllTx,
  type MarginAccountData,
} from '../../../lib/unified-margin';

interface UseMarginAccountResult {
  // Account state
  account: MarginAccountData | null;
  accountId: string | null;
  isLoading: boolean;
  error: Error | null;

  // Account actions
  createAccount: () => Promise<void>;
  deposit: (nusdcCoinId: string, amount: bigint) => Promise<void>;
  withdraw: (amount: bigint) => Promise<void>;
  withdrawAll: () => Promise<void>;

  // Action states
  isCreating: boolean;
  isDepositing: boolean;
  isWithdrawing: boolean;

  // Helpers
  refetch: () => void;
  hasAccount: boolean;
}

export function useMarginAccount(): UseMarginAccountResult {
  const { account: walletAccount, status, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const queryClient = useQueryClient();
  const adaptiveInterval = useAdaptiveInterval(10_000);

  // Determine active wallet (zkLogin > local > passkey)
  const isLocalWalletActive = status === 'unlocked' && !!walletAccount?.address;
  const activeAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? walletAccount?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;
  const isWalletConnected = isZkLoggedIn || isLocalWalletActive || isPasskeyUnlocked;

  const [marginAccountId, setMarginAccountId] = useState<string | null>(null);

  // Reset marginAccountId when activeAddress changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeAddress) {
      const storedId = getStoredMarginAccountId(activeAddress);
      setMarginAccountId(storedId);
    } else {
      setMarginAccountId(null);
    }
  }, [activeAddress]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Find or use stored account ID
  const { data: foundAccountId, isLoading: isFinding } = useQuery({
    queryKey: ['margin-account-id', activeAddress],
    queryFn: async () => {
      if (!activeAddress) return null;

      // First check localStorage
      const storedId = getStoredMarginAccountId(activeAddress);
      if (storedId) {
        // Verify it still exists
        const account = await getMarginAccount(storedId);
        if (account && account.owner === activeAddress) {
          return storedId;
        }
      }

      // Search on-chain
      return findUserMarginAccount(activeAddress);
    },
    enabled: isWalletConnected && !!activeAddress,
    staleTime: 30_000,
  });

  // Update local state when account is found
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (foundAccountId && foundAccountId !== marginAccountId && activeAddress) {
      setMarginAccountId(foundAccountId);
      storeMarginAccountId(activeAddress, foundAccountId);
    }
  }, [foundAccountId, marginAccountId, activeAddress]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fetch account data with owner verification
  const {
    data: account,
    isLoading: isLoadingAccount,
    error,
    refetch,
  } = useQuery({
    queryKey: ['margin-account', marginAccountId, activeAddress],
    queryFn: async () => {
      if (!marginAccountId || !activeAddress) return null;
      const account = await getMarginAccount(marginAccountId);
      // Owner verification - prevent displaying another user's account
      if (account && account.owner !== activeAddress) {
        console.error('[MarginAccount] Owner mismatch', {
          expected: activeAddress,
          actual: account.owner,
          accountId: marginAccountId,
        });
        return null;
      }
      return account;
    },
    enabled: !!marginAccountId && !!activeAddress,
    refetchInterval: adaptiveInterval,
    staleTime: 5_000,
  });

  // Helper to sign and execute transaction (supports both local wallet and zkLogin)
  const signAndExecute = useCallback(
    async (tx: Transaction) => {
      if (!activeAddress) throw new Error('Wallet not connected');

      const client = getSuiClient();
      tx.setSender(activeAddress);
      const bytes = await tx.build({ client });

      let signature: string;
      if (isZkLoggedIn && zkState) {
        // zkLogin signing
        signature = await zkSignTransaction(bytes);
      } else if (isPasskeyUnlocked && passkeyKeypair) {
        // Passkey signing
        const signResult = await passkeyKeypair.signTransaction(bytes);
        signature = signResult.signature;
      } else {
        // Local wallet signing
        const keypair = getKeypair();
        if (!keypair) throw new Error('Keypair not available');
        const signResult = await keypair.signTransaction(bytes);
        signature = signResult.signature;
      }

      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true, showObjectChanges: true },
      });

      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error || 'Transaction failed');
      }

      // Block until fullnode has applied effects, so any subsequent tx in the
      // same flow sees fresh owned-object versions (avoids LockConflict races).
      await client.waitForTransaction({ digest: result.digest });

      return result;
    },
    [activeAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction, isPasskeyUnlocked, passkeyKeypair]
  );

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const tx = buildCreateAccountTx();
      const result = await signAndExecute(tx);

      // Find the created MarginAccount from objectChanges
      const createdObjects = result.objectChanges?.filter(
        (change): change is SuiObjectChange & { type: 'created' } =>
          change.type === 'created'
      );

      const marginAccountObj = createdObjects?.find(
        (obj) =>
          obj.objectType?.includes('MarginAccount') &&
          obj.owner &&
          typeof obj.owner === 'object' &&
          'AddressOwner' in obj.owner
      );

      if (marginAccountObj && activeAddress) {
        const newAccountId = marginAccountObj.objectId;
        setMarginAccountId(newAccountId);
        storeMarginAccountId(activeAddress, newAccountId);
        return newAccountId;
      }

      throw new Error('Failed to find created MarginAccount');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['margin-account-id'] });
    },
  });

  // Deposit mutation
  const depositMutation = useMutation({
    mutationFn: async ({
      nusdcCoinId,
      amount,
    }: {
      nusdcCoinId: string;
      amount: bigint;
    }) => {
      if (!marginAccountId) throw new Error('No margin account');

      const tx = buildDepositWithSplitTx(marginAccountId, nusdcCoinId, amount);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

  // Withdraw mutation
  const withdrawMutation = useMutation({
    mutationFn: async ({ amount }: { amount: bigint }) => {
      if (!marginAccountId) throw new Error('No margin account');

      const tx = buildWithdrawTx(marginAccountId, amount);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

  // Withdraw all mutation
  const withdrawAllMutation = useMutation({
    mutationFn: async () => {
      if (!marginAccountId) throw new Error('No margin account');

      const tx = buildWithdrawAllTx(marginAccountId);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

  // Action callbacks
  const createAccount = useCallback(async () => {
    await createAccountMutation.mutateAsync();
  }, [createAccountMutation]);

  const deposit = useCallback(
    async (nusdcCoinId: string, amount: bigint) => {
      await depositMutation.mutateAsync({ nusdcCoinId, amount });
    },
    [depositMutation]
  );

  const withdraw = useCallback(
    async (amount: bigint) => {
      await withdrawMutation.mutateAsync({ amount });
    },
    [withdrawMutation]
  );

  const withdrawAll = useCallback(async () => {
    await withdrawAllMutation.mutateAsync();
  }, [withdrawAllMutation]);

  return {
    account: account ?? null,
    accountId: marginAccountId,
    isLoading: isFinding || isLoadingAccount,
    error: error as Error | null,

    createAccount,
    deposit,
    withdraw,
    withdrawAll,

    isCreating: createAccountMutation.isPending,
    isDepositing: depositMutation.isPending,
    isWithdrawing: withdrawMutation.isPending || withdrawAllMutation.isPending,

    refetch,
    // Only true if account exists AND owner matches current user
    hasAccount: !!marginAccountId && !!account && account.owner === activeAddress,
  };
}
