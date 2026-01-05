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
import { useWallet, getSuiClient } from '@nasun/wallet';
import type { SuiObjectChange } from '@mysten/sui/client';
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
  const queryClient = useQueryClient();

  const [marginAccountId, setMarginAccountId] = useState<string | null>(() =>
    walletAccount?.address ? getStoredMarginAccountId(walletAccount.address) : null
  );

  // Find or use stored account ID
  const { data: foundAccountId, isLoading: isFinding } = useQuery({
    queryKey: ['margin-account-id', walletAccount?.address],
    queryFn: async () => {
      if (!walletAccount?.address) return null;

      // First check localStorage
      const storedId = getStoredMarginAccountId(walletAccount.address);
      if (storedId) {
        // Verify it still exists
        const account = await getMarginAccount(storedId);
        if (account && account.owner === walletAccount.address) {
          return storedId;
        }
      }

      // Search on-chain
      return findUserMarginAccount(walletAccount.address);
    },
    enabled: status === 'unlocked' && !!walletAccount?.address,
    staleTime: 30_000,
  });

  // Update local state when account is found
  useEffect(() => {
    if (foundAccountId && foundAccountId !== marginAccountId && walletAccount?.address) {
      setMarginAccountId(foundAccountId);
      storeMarginAccountId(walletAccount.address, foundAccountId);
    }
  }, [foundAccountId, marginAccountId, walletAccount?.address]);

  // Fetch account data
  const {
    data: account,
    isLoading: isLoadingAccount,
    error,
    refetch,
  } = useQuery({
    queryKey: ['margin-account', marginAccountId],
    queryFn: async () => {
      if (!marginAccountId) return null;
      return getMarginAccount(marginAccountId);
    },
    enabled: !!marginAccountId,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  // Helper to sign and execute transaction
  const signAndExecute = useCallback(
    async (tx: ReturnType<typeof buildCreateAccountTx>) => {
      const keypair = getKeypair();
      if (!keypair) throw new Error('Wallet not unlocked');

      const client = getSuiClient();
      return client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true, showObjectChanges: true },
      });
    },
    [getKeypair]
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

      if (marginAccountObj && walletAccount?.address) {
        const newAccountId = marginAccountObj.objectId;
        setMarginAccountId(newAccountId);
        storeMarginAccountId(walletAccount.address, newAccountId);
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
    hasAccount: !!marginAccountId,
  };
}
