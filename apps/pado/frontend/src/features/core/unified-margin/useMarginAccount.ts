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
import { useActiveAddress } from '../../../hooks/useActiveAddress';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { SuiObjectChange } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
  getMarginAccount,
  findUserMarginAccount,
  getStoredMarginAccountId,
  storeMarginAccountId,
  getStoredBalanceManagerId,
  buildCreateAccountTx,
  buildEnablePadoTx,
  buildDepositWithSplitTx,
  buildDepositNbtcWithSplitTx,
  buildDepositNethWithSplitTx,
  buildDepositNsolWithSplitTx,
  buildWithdrawNethTx,
  buildWithdrawNsolTx,
  buildSwapAndDepositTx,
  buildWithdrawTx,
  buildWithdrawAllTx,
  buildWithdrawAllPadoTx,
  NUSDC_TYPE,
  NBTC_TYPE,
  NETH_TYPE,
  NSOL_TYPE,
  type MarginAccountData,
} from '../../../lib/unified-margin';
import { depositPoolFor } from '../../../lib/deepbook';
import { TOKENS } from '../../../config/network';
import { pickCoinsForAmount, totalBalance } from '../../../lib/coin-selection';

interface UseMarginAccountResult {
  // Account state
  account: MarginAccountData | null;
  accountId: string | null;
  isLoading: boolean;
  error: Error | null;

  // Account actions
  createAccount: () => Promise<void>;
  enablePado: () => Promise<{ balanceManagerId: string; marginAccountId: string }>;
  deposit: (nusdcCoinId: string, amount: bigint) => Promise<void>;
  depositByAmount: (rawAmount: bigint) => Promise<void>;
  /** Deposit NBTC directly as native multi-collateral (no swap). */
  depositNbtc: (rawAmount: bigint) => Promise<void>;
  /** Deposit NETH directly as native multi-collateral (post-V8). */
  depositNeth: (rawAmount: bigint) => Promise<void>;
  /** Deposit NSOL directly as native multi-collateral (post-V8). */
  depositNsol: (rawAmount: bigint) => Promise<void>;
  /** Withdraw NETH from MA. */
  withdrawNeth: (rawAmount: bigint) => Promise<void>;
  /** Withdraw NSOL from MA. */
  withdrawNsol: (rawAmount: bigint) => Promise<void>;
  /** Swap a non-native token to NUSDC and deposit, atomically. Kept as a secondary path. */
  depositSwap: (params: { fromSymbol: 'NETH' | 'NSOL' | 'NSN'; rawAmount: bigint; minQuoteOut: bigint }) => Promise<void>;
  withdraw: (amount: bigint) => Promise<void>;
  withdrawAll: () => Promise<void>;
  withdrawAllPado: () => Promise<void>;

  // Action states
  isCreating: boolean;
  isEnabling: boolean;
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
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const queryClient = useQueryClient();
  const adaptiveInterval = useAdaptiveInterval(10_000);

  // Use the shared active-address resolver so balance display, deposit
  // selection, and signing all agree on which wallet is active.
  const activeAddress = useActiveAddress();
  const isLocalWalletActive = status === 'unlocked' && !!walletAccount?.address;
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

  // Single-PTB Enable Pado mutation: creates BalanceManager + MarginAccount
  // atomically. Either both objects exist after this call, or neither — no
  // partial state.
  // NOTE: Only the MA ID is stored here. Callers (trading layer) are responsible
  // for registering the BM ID into the trading store via useTrading.registerBalanceManager,
  // keeping core layer free of trading-layer dependencies.
  const enablePadoMutation = useMutation({
    mutationFn: async () => {
      if (!activeAddress) throw new Error('Wallet not connected');

      const tx = buildEnablePadoTx();
      const result = await signAndExecute(tx);

      const created = result.objectChanges?.filter(
        (c): c is SuiObjectChange & { type: 'created' } => c.type === 'created',
      ) ?? [];

      const bmObj = created.find((o) => o.objectType?.includes('::balance_manager::BalanceManager'));
      const maObj = created.find((o) => o.objectType?.includes('::unified_margin::MarginAccount'));

      if (!bmObj) {
        throw new Error('Failed to find created BalanceManager in PTB result');
      }
      if (!maObj) {
        throw new Error('Failed to find created MarginAccount in PTB result');
      }

      const balanceManagerId = (bmObj as { objectId: string }).objectId;
      const marginAccountId = (maObj as { objectId: string }).objectId;

      storeMarginAccountId(activeAddress, marginAccountId);
      setMarginAccountId(marginAccountId);

      return { balanceManagerId, marginAccountId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['margin-account-id'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

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

  // Deposit by raw amount: auto-finds the NUSDC coin, handles split
  const depositByAmountMutation = useMutation({
    mutationFn: async (rawAmount: bigint) => {
      if (!marginAccountId) throw new Error('No margin account');
      if (!activeAddress) throw new Error('Wallet not connected');

      const client = getSuiClient();
      const coins = await client.getCoins({ owner: activeAddress, coinType: NUSDC_TYPE });
      // Total balance across all coin objects. Faucet claims fragment NUSDC
      // into many small coins (saw 208 coins / ~23k NUSDC in field), so a
      // single-coin deposit cannot cover large amounts even when the wallet
      // total is sufficient.
      const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);
      // Prefer the smallest coin with sufficient balance (no merge needed).
      const sufficient = coins.data.filter(c => BigInt(c.balance) >= rawAmount);
      let primaryCoin: typeof coins.data[number] | undefined;
      let extraCoinIds: string[] = [];
      if (sufficient.length > 0) {
        primaryCoin = sufficient.reduce((a, b) => BigInt(a.balance) <= BigInt(b.balance) ? a : b);
      } else if (totalBalance >= rawAmount) {
        // No single coin is enough but wallet total is. Merge into the largest
        // coin first, then split the requested amount out of the merged coin.
        const sortedDesc = [...coins.data].sort((a, b) =>
          BigInt(b.balance) > BigInt(a.balance) ? 1 : -1
        );
        primaryCoin = sortedDesc[0];
        extraCoinIds = sortedDesc.slice(1).map(c => c.coinObjectId);
      } else {
        primaryCoin = coins.data[0];
      }
      const coin = primaryCoin;
      if (!coin) {
        // Diagnostic: list all coin types this address actually holds, so we can
        // tell whether the wallet has zero balance vs. a coin-type mismatch
        // (e.g. user funded NUSDC from a different token package than the env
        // is configured for).
        const all = await client.getAllBalances({ owner: activeAddress });
        const nonZero = all.filter(b => BigInt(b.totalBalance) > 0n);
        console.warn('[deposit] expected NUSDC type:', NUSDC_TYPE);
        console.warn('[deposit] address:', activeAddress);
        console.warn('[deposit] coin types held at this address:', nonZero);
        const short = `${activeAddress.slice(0, 6)}…${activeAddress.slice(-4)}`;
        const hint = nonZero.length === 0
          ? 'This address holds no coins at all on this network.'
          : `Address holds ${nonZero.length} coin type(s) but none match the configured NUSDC type. Open the browser console for details.`;
        throw new Error(`No NUSDC coins at ${short}. ${hint}`);
      }

      const tx = buildDepositWithSplitTx(marginAccountId, coin.coinObjectId, rawAmount, extraCoinIds);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

  // Deposit NBTC directly as native multi-collateral (5% haircut).
  // Mirrors depositByAmount but routes to deposit_nbtc; NBTC is never swapped.
  const depositNbtcMutation = useMutation({
    mutationFn: async (rawAmount: bigint) => {
      if (!marginAccountId) throw new Error('No margin account');
      if (!activeAddress) throw new Error('Wallet not connected');

      const client = getSuiClient();
      const coins = await client.getCoins({ owner: activeAddress, coinType: NBTC_TYPE });
      const total = totalBalance(coins.data);
      if (total < rawAmount) {
        throw new Error(`Insufficient NBTC balance: have ${total}, need ${rawAmount}`);
      }

      const { primary, extras } = pickCoinsForAmount(coins.data, rawAmount);
      const tx = buildDepositNbtcWithSplitTx(marginAccountId, primary.coinObjectId, rawAmount, extras);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

  const depositNethMutation = useMutation({
    mutationFn: async (rawAmount: bigint) => {
      if (!marginAccountId) throw new Error('No margin account');
      if (!activeAddress) throw new Error('Wallet not connected');
      if (!NETH_TYPE) throw new Error('NETH type not configured');

      const client = getSuiClient();
      const coins = await client.getCoins({ owner: activeAddress, coinType: NETH_TYPE });
      const total = totalBalance(coins.data);
      if (total < rawAmount) {
        throw new Error(`Insufficient NETH balance: have ${total}, need ${rawAmount}`);
      }
      const { primary, extras } = pickCoinsForAmount(coins.data, rawAmount);
      const tx = buildDepositNethWithSplitTx(marginAccountId, primary.coinObjectId, rawAmount, extras);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

  const depositNsolMutation = useMutation({
    mutationFn: async (rawAmount: bigint) => {
      if (!marginAccountId) throw new Error('No margin account');
      if (!activeAddress) throw new Error('Wallet not connected');
      if (!NSOL_TYPE) throw new Error('NSOL type not configured');

      const client = getSuiClient();
      const coins = await client.getCoins({ owner: activeAddress, coinType: NSOL_TYPE });
      const total = totalBalance(coins.data);
      if (total < rawAmount) {
        throw new Error(`Insufficient NSOL balance: have ${total}, need ${rawAmount}`);
      }
      const { primary, extras } = pickCoinsForAmount(coins.data, rawAmount);
      const tx = buildDepositNsolWithSplitTx(marginAccountId, primary.coinObjectId, rawAmount, extras);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

  const withdrawNethMutation = useMutation({
    mutationFn: async (rawAmount: bigint) => {
      if (!marginAccountId) throw new Error('No margin account');
      const tx = buildWithdrawNethTx(marginAccountId, rawAmount);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

  const withdrawNsolMutation = useMutation({
    mutationFn: async (rawAmount: bigint) => {
      if (!marginAccountId) throw new Error('No margin account');
      const tx = buildWithdrawNsolTx(marginAccountId, rawAmount);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
    },
  });

  // Atomic swap (base → NUSDC) + deposit. Secondary path retained for users
  // who prefer NUSDC accounting over native NETH/NSOL haircuts.
  const depositSwapMutation = useMutation({
    mutationFn: async (params: {
      fromSymbol: 'NETH' | 'NSOL' | 'NSN';
      rawAmount: bigint;
      minQuoteOut: bigint;
    }) => {
      if (!marginAccountId) throw new Error('No margin account');
      if (!activeAddress) throw new Error('Wallet not connected');

      const pool = depositPoolFor(params.fromSymbol);
      if (!pool) throw new Error(`No deposit pool for ${params.fromSymbol}`);

      const tokenType = TOKENS[params.fromSymbol === 'NSN' ? 'NASUN' : params.fromSymbol].type;
      if (!tokenType) throw new Error(`Token type not configured: ${params.fromSymbol}`);

      const client = getSuiClient();
      const coins = await client.getCoins({ owner: activeAddress, coinType: tokenType });
      const total = totalBalance(coins.data);
      if (total < params.rawAmount) {
        throw new Error(`Insufficient ${params.fromSymbol} balance: have ${total}, need ${params.rawAmount}`);
      }

      const { primary, extras } = pickCoinsForAmount(coins.data, params.rawAmount);
      const tx = buildSwapAndDepositTx({
        marginAccountId,
        pool,
        baseCoinId: primary.coinObjectId,
        extraBaseCoinIds: extras,
        baseAmount: params.rawAmount,
        minQuoteOut: params.minQuoteOut,
        sender: activeAddress,
      });
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
    },
  });

  // Drain both BM and MA in a single PTB. Uses withdraw_all on the BM to avoid
  // the TOCTOU race between balance fetch and TX submission.
  const withdrawAllPadoMutation = useMutation({
    mutationFn: async () => {
      if (!activeAddress) throw new Error('Wallet not connected');

      const balanceManagerId = getStoredBalanceManagerId(activeAddress);
      if (!marginAccountId && !balanceManagerId) throw new Error('Nothing to withdraw');

      const tx = buildWithdrawAllPadoTx(marginAccountId, balanceManagerId, activeAddress);
      await signAndExecute(tx);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['margin-account'] });
      queryClient.invalidateQueries({ queryKey: ['multi-balance'] });
      queryClient.invalidateQueries({ queryKey: ['balance-manager-balance'] });
      queryClient.invalidateQueries({ queryKey: ['bm-balance-global'] });
      queryClient.invalidateQueries({ queryKey: ['bm-balance-pado-account'] });
    },
  });

  // Action callbacks
  const createAccount = useCallback(async () => {
    await createAccountMutation.mutateAsync();
  }, [createAccountMutation]);

  const enablePado = useCallback(async () => {
    return enablePadoMutation.mutateAsync();
  }, [enablePadoMutation]);

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

  const depositByAmount = useCallback(async (rawAmount: bigint) => {
    await depositByAmountMutation.mutateAsync(rawAmount);
  }, [depositByAmountMutation]);

  const depositNbtc = useCallback(async (rawAmount: bigint) => {
    await depositNbtcMutation.mutateAsync(rawAmount);
  }, [depositNbtcMutation]);

  const depositNeth = useCallback(async (rawAmount: bigint) => {
    await depositNethMutation.mutateAsync(rawAmount);
  }, [depositNethMutation]);

  const depositNsol = useCallback(async (rawAmount: bigint) => {
    await depositNsolMutation.mutateAsync(rawAmount);
  }, [depositNsolMutation]);

  const withdrawNeth = useCallback(async (rawAmount: bigint) => {
    await withdrawNethMutation.mutateAsync(rawAmount);
  }, [withdrawNethMutation]);

  const withdrawNsol = useCallback(async (rawAmount: bigint) => {
    await withdrawNsolMutation.mutateAsync(rawAmount);
  }, [withdrawNsolMutation]);

  const depositSwap = useCallback(async (params: { fromSymbol: 'NETH' | 'NSOL' | 'NSN'; rawAmount: bigint; minQuoteOut: bigint }) => {
    await depositSwapMutation.mutateAsync(params);
  }, [depositSwapMutation]);

  const withdrawAllPado = useCallback(async () => {
    await withdrawAllPadoMutation.mutateAsync();
  }, [withdrawAllPadoMutation]);

  return {
    account: account ?? null,
    accountId: marginAccountId,
    isLoading: isFinding || isLoadingAccount,
    error: error as Error | null,

    createAccount,
    enablePado,
    deposit,
    depositByAmount,
    depositNbtc,
    depositNeth,
    depositNsol,
    withdrawNeth,
    withdrawNsol,
    depositSwap,
    withdraw,
    withdrawAll,
    withdrawAllPado,

    isCreating: createAccountMutation.isPending,
    isEnabling: enablePadoMutation.isPending,
    isDepositing:
      depositMutation.isPending ||
      depositByAmountMutation.isPending ||
      depositNbtcMutation.isPending ||
      depositNethMutation.isPending ||
      depositNsolMutation.isPending ||
      depositSwapMutation.isPending,
    isWithdrawing:
      withdrawMutation.isPending ||
      withdrawAllMutation.isPending ||
      withdrawAllPadoMutation.isPending ||
      withdrawNethMutation.isPending ||
      withdrawNsolMutation.isPending,

    refetch,
    // Only true if account exists AND owner matches current user
    hasAccount: !!marginAccountId && !!account && account.owner === activeAddress,
  };
}
