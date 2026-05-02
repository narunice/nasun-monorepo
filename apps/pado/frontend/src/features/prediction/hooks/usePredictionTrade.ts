/**
 * usePredictionTrade Hook (round-6 plan §2.4)
 *
 * Wraps every taker/maker/lifecycle entry function in the v1 CLOB.
 * Async-aware payment assembly (mergeCoins + splitCoins inside the same tx).
 * Per-market reentrancy guard. Post-tx invalidation against the
 * `['prediction']` query key prefix.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { buildNusdcFaucetTx } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import {
  buildMintOutcomeTokens,
  buildPlaceBuyTaker,
  buildPlaceSellTaker,
  buildPlaceBuyMaker,
  buildPlaceSellMaker,
  buildCancelOrder,
  buildClaimRestingOrderRefund,
  buildCancelExpiredMarket,
  buildClaimCancelledRefund,
  buildClaimWinnings,
  buildBurnLosingPosition,
} from '../transactions';
import { buildCreateBalanceManager } from '../../trading/transactions';
import { useBalanceManagerStore } from '../../trading/stores/balanceManagerStore';
import { storeBalanceManagerId } from '../../../lib/unified-margin';
import { assembleUnifiedPaymentArg } from '../../../lib/payment';
import { useMarginAccount } from '../../core/unified-margin';
import { useToast } from '@/components/common/Toast';
import { NUSDC_DECIMALS } from '../constants';

interface TradeResult {
  success: boolean;
  digest?: string;
  error?: string;
}

/**
 * Round-7 R7-C1 mutex: serialize NUSDC-spending operations per wallet so that
 * concurrent ops (different markets / two tabs in the same tab process) cannot
 * race on the same `coins[0]` and produce LockConflict.
 *
 * Cross-tab is NOT covered (each tab has its own module instance). For that,
 * parseTradeError surfaces a clear retry message on LockConflict.
 *
 * Sell/cancel/claim ops do not consume NUSDC and are not gated.
 */
const nusdcSpendChain = new Map<string, Promise<unknown>>();

async function withNusdcLock<T>(walletAddress: string, fn: () => Promise<T>): Promise<T> {
  const prev = nusdcSpendChain.get(walletAddress) ?? Promise.resolve();
  const next: Promise<T> = prev.then(fn, fn);
  // Store the swallowed-error variant so the next caller doesn't reject prematurely.
  const swallowed = next.catch(() => undefined);
  nusdcSpendChain.set(walletAddress, swallowed);
  try {
    return await next;
  } finally {
    if (nusdcSpendChain.get(walletAddress) === swallowed) {
      nusdcSpendChain.delete(walletAddress);
    }
  }
}

interface UsePredictionTradeResult {
  isLoading: boolean;
  isFaucetLoading: boolean;
  error: string | null;

  // BM state for payment routing
  bmId: string | null;
  createPadoAccount: () => Promise<{ success: boolean; digest?: string; error?: string; newBmId?: string }>;

  // R7-C2: replaced single `recoverResolvedFunds` with a two-step API.
  claimRestingRefundsBatch: (
    marketId: string,
    restingOrders: Array<{ isYes: boolean; isBid: boolean; priceBps: number; orderId: number | bigint }>,
  ) => Promise<TradeResult>;
  settlePositionsBatch: (
    marketId: string,
    positions: Array<{ positionId: string; won: boolean }>,
  ) => Promise<TradeResult>;

  placeBuyTaker: (
    marketId: string,
    isYes: boolean,
    maxPriceBps: number,
    restOnNoFill: boolean,
    amountUnits: bigint,
  ) => Promise<TradeResult>;
  placeSellTaker: (
    marketId: string,
    positionId: string,
    minPriceBps: number,
    restOnNoFill: boolean,
  ) => Promise<TradeResult>;
  placeBuyMaker: (
    marketId: string,
    isYes: boolean,
    priceBps: number,
    amountUnits: bigint,
  ) => Promise<TradeResult>;
  placeSellMaker: (
    marketId: string,
    positionId: string,
    priceBps: number,
  ) => Promise<TradeResult>;
  mintTokens: (marketId: string, amountUnits: bigint) => Promise<TradeResult>;
  cancelOrder: (
    marketId: string,
    isYes: boolean,
    isBid: boolean,
    priceBps: number,
    orderId: number | bigint,
  ) => Promise<TradeResult>;
  claimRestingOrderRefund: (
    marketId: string,
    isYes: boolean,
    isBid: boolean,
    priceBps: number,
    orderId: number | bigint,
  ) => Promise<TradeResult>;
  cancelExpiredMarket: (marketId: string) => Promise<TradeResult>;
  claimCancelledRefund: (marketId: string, positionId: string) => Promise<TradeResult>;
  claimWinnings: (marketId: string, positionId: string) => Promise<TradeResult>;
  burnLosingPosition: (marketId: string, positionId: string) => Promise<TradeResult>;
  requestNusdc: () => Promise<TradeResult>;
}

function parseTradeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('"code":"deleted"') || message.includes('ObjectDeleted')) {
    return 'This object has already been used or transferred. Please refresh.';
  }
  // R7-W: cross-tab / cross-device coin-object lock collision.
  if (message.includes('LockConflict') || message.includes('ObjectLocked') || message.includes('ObjectVersionMismatch')) {
    return 'Another tab or device is processing a transaction. Wait a moment and retry.';
  }
  if (message.includes('ObjectNotFound') || message.includes('not found')) {
    return 'Object not found. It may have been transferred or used.';
  }
  if (message.includes('InsufficientGas') || message.includes('insufficient gas')) {
    return 'Not enough NSN for transaction fees. Please get some from the faucet.';
  }
  if (message.includes('InsufficientCoinBalance')) {
    return 'Insufficient balance. Please check your NUSDC balance.';
  }
  if (message.includes('Insufficient NUSDC')) {
    return 'Insufficient NUSDC.';
  }

  // MoveAbort error code mapping (round-6 plan §2.4 parseTradeError table)
  const errorCodeMatch = message.match(/(?:error[_\s]?code:?\s*|,\s*)(\d+)(?:\s*\)|$)/i);
  const moveAbortMatch = errorCodeMatch || message.match(/MoveAbort[^,]*,\s*(\d+)/);
  if (moveAbortMatch) {
    const code = parseInt(moveAbortMatch[1]);
    switch (code) {
      case 0: return 'Market is not open for trading.';
      case 1: return 'Market has not closed yet.';
      case 2: return 'Market has already been resolved.';
      case 3: return 'Only the designated resolver can resolve this market.';
      case 4: return 'Market has not been resolved yet.';
      case 5: return 'This position did not win.';
      case 6: return 'Insufficient balance.';
      case 7: return 'Invalid price. Must be between 1% and 99%.';
      case 8: return 'Order not found.';
      case 9: return 'You are not the owner of this order.';
      case 10: return 'Market has expired.';
      case 11: return 'Cannot trade with yourself.';
      case 12: return 'Market is not cancelled.';
      case 13: return 'Position does not belong to this market.';
      case 14: return 'Resolve deadline has not passed yet.';
      case 15: return 'Market cannot be cancelled in its current state.';
      case 16: return 'Creator and resolver addresses must differ.';
      case 17: return 'Invalid input. Check amount, price, and time settings.';
      case 18: return 'Order is too large to fill in one transaction. Try smaller size or different price.';
      case 19: return 'No matching orders at market price. Try a Limit order or wait for liquidity.';
      case 20: return 'Order not found. It may have been filled or cancelled.';
      case 100: return 'Price moved too much during your order. Refresh the orderbook and try again.';
      case 101: return 'Trade value cannot be zero.';
      default: return `Transaction failed (code: ${code}). Please try again.`;
    }
  }

  if (message.includes('Transaction failed')) {
    return 'Transaction failed. Please try again.';
  }
  if (message.length > 100) {
    return 'Transaction failed. Please refresh and try again.';
  }
  return message;
}

export function usePredictionTrade(): UsePredictionTradeResult {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const { showToast } = useToast();
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

  // Shared BM store: same instance as useTrading. Prediction reads this to route payments.
  const bmId = useBalanceManagerStore((s) => s.balanceManagerId);
  const setBalanceManagerId = useBalanceManagerStore((s) => s.setBalanceManagerId);

  // MA: unified margin account — used as primary payment source (MA-first routing).
  const { account: maAccount, accountId: maAccountId } = useMarginAccount();

  const [isLoading, setIsLoading] = useState(false);
  const [isFaucetLoading, setIsFaucetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-market reentrancy lock (round-6 plan §2.4)
  const pendingOpRef = useRef<Record<string, string>>({});

  // Clear locks when wallet changes.
  useEffect(() => {
    pendingOpRef.current = {};
  }, [walletAddress]);

  const signAndExecute = useCallback(
    async (tx: Transaction, opts: { showObjectChanges?: boolean } = {}) => {
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
        options: { showEffects: true, showObjectChanges: opts.showObjectChanges },
      });

      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error || 'Transaction failed');
      }
      return result;
    },
    [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction, isPasskeyUnlocked, passkeyKeypair],
  );

  /**
   * Round-7 W: scoped invalidation. Operations invalidate only the queries that
   * actually changed (orderbook + positions + recent fills + the single market).
   * The list page (`['prediction', 'markets']`) is invalidated only on lifecycle
   * ops (create / cancelExpired / resolve).
   */
  const invalidateMarketScoped = useCallback(
    (marketId: string, alsoInvalidateMarketsList = false) => {
      const addr = walletAddress;
      queryClient.invalidateQueries({ queryKey: ['prediction', 'market', marketId] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', marketId, 'yes'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', marketId, 'no'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'recent-fills', marketId] });
      if (addr) {
        queryClient.invalidateQueries({ queryKey: ['prediction-positions', addr, marketId] });
        queryClient.invalidateQueries({ queryKey: ['prediction', 'my-orders', marketId, addr] });
      }
      if (alsoInvalidateMarketsList) {
        queryClient.invalidateQueries({ queryKey: ['prediction-markets-with-orderbooks'] });
      }
    },
    [queryClient, walletAddress],
  );

  // Invalidate wallet + BM balance caches after any state-changing trade.
  // Mirrors useOrderActions.ts:236-243 canonical pattern.
  const invalidateBalances = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wallet-multi-balance'] });
    queryClient.invalidateQueries({ queryKey: ['bm-balance-global'] });
    queryClient.invalidateQueries({ queryKey: ['balance-manager-balance'] });
    queryClient.invalidateQueries({ queryKey: ['margin-account'] });
  }, [queryClient]);

  const runOperation = useCallback(
    async (
      marketId: string,
      opName: string,
      build: (tx: Transaction, client: SuiClient) => Promise<void> | void,
      successMessage: string,
      opts: { useNusdcLock?: boolean; invalidateMarketsList?: boolean } = {},
    ): Promise<TradeResult> => {
      if (!isWalletConnected || !walletAddress) {
        showToast('Please connect your wallet', 'error');
        return { success: false, error: 'Wallet not connected' };
      }
      if (pendingOpRef.current[marketId]) {
        const msg = 'Another transaction is in progress for this market.';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      pendingOpRef.current[marketId] = opName;
      setIsLoading(true);
      setError(null);

      const exec = async (): Promise<TradeResult> => {
        try {
          const tx = new Transaction();
          const client = getSuiClient();
          await build(tx, client);
          const result = await signAndExecute(tx);
          // R7-W: wait for indexer so subsequent refetch hits indexed state.
          if (result.digest) {
            try {
              await client.waitForTransaction({
                digest: result.digest,
                options: { showEffects: true },
                timeout: 8_000,
              });
            } catch {
              // Best-effort. If wait times out, the invalidation below will eventually win.
            }
          }
          const digestSuffix = result.digest ? ` — ${result.digest.slice(0, 8)}...` : '';
          showToast(`${successMessage}${digestSuffix}`, 'success');
          invalidateMarketScoped(marketId, opts.invalidateMarketsList);
          invalidateBalances();
          return { success: true, digest: result.digest };
        } catch (err) {
          const message = parseTradeError(err);
          setError(message);
          showToast(message, 'error');
          return { success: false, error: message };
        }
      };

      try {
        // R7-C1: serialize NUSDC-spending ops per wallet so concurrent calls
        // don't race on the same coin object.
        if (opts.useNusdcLock) {
          return await withNusdcLock(walletAddress, exec);
        }
        return await exec();
      } finally {
        delete pendingOpRef.current[marketId];
        setIsLoading(false);
      }
    },
    [isWalletConnected, walletAddress, signAndExecute, showToast, invalidateMarketScoped, invalidateBalances],
  );

  const placeBuyTaker = useCallback(
    (marketId: string, isYes: boolean, maxPriceBps: number, restOnNoFill: boolean, amountUnits: bigint) =>
      runOperation(
        marketId,
        `buy-taker:${isYes}`,
        async (tx, client) => {
          const currentBmId = useBalanceManagerStore.getState().balanceManagerId;
          const { paymentArg } = await assembleUnifiedPaymentArg(tx, amountUnits, walletAddress!, {
            bmId: currentBmId,
            maId: maAccountId ?? null,
            maBalance: maAccount?.nusdcBalance ?? 0n,
            client,
          });
          buildPlaceBuyTaker(tx, marketId, isYes, maxPriceBps, restOnNoFill, amountUnits, paymentArg);
        },
        restOnNoFill ? 'Limit buy submitted' : 'Buy filled',
        { useNusdcLock: true },
      ),
    [runOperation, walletAddress, maAccountId, maAccount?.nusdcBalance],
  );

  const placeSellTaker = useCallback(
    (marketId: string, positionId: string, minPriceBps: number, restOnNoFill: boolean) =>
      runOperation(
        marketId,
        `sell-taker:${positionId}`,
        (tx) => {
          buildPlaceSellTaker(tx, marketId, positionId, minPriceBps, restOnNoFill);
        },
        restOnNoFill ? 'Limit sell submitted' : 'Sell filled',
      ),
    [runOperation],
  );

  const placeBuyMaker = useCallback(
    (marketId: string, isYes: boolean, priceBps: number, amountUnits: bigint) =>
      runOperation(
        marketId,
        `buy-maker:${isYes}:${priceBps}`,
        async (tx, client) => {
          const currentBmId = useBalanceManagerStore.getState().balanceManagerId;
          const { paymentArg } = await assembleUnifiedPaymentArg(tx, amountUnits, walletAddress!, {
            bmId: currentBmId,
            maId: maAccountId ?? null,
            maBalance: maAccount?.nusdcBalance ?? 0n,
            client,
          });
          buildPlaceBuyMaker(tx, marketId, isYes, priceBps, amountUnits, paymentArg);
        },
        'Limit buy resting',
        { useNusdcLock: true },
      ),
    [runOperation, walletAddress, maAccountId, maAccount?.nusdcBalance],
  );

  const placeSellMaker = useCallback(
    (marketId: string, positionId: string, priceBps: number) =>
      runOperation(
        marketId,
        `sell-maker:${positionId}:${priceBps}`,
        (tx) => buildPlaceSellMaker(tx, marketId, positionId, priceBps),
        'Limit sell resting',
      ),
    [runOperation],
  );

  const mintTokens = useCallback(
    (marketId: string, amountUnits: bigint) =>
      runOperation(
        marketId,
        'mint',
        async (tx, client) => {
          const currentBmId = useBalanceManagerStore.getState().balanceManagerId;
          const { paymentArg } = await assembleUnifiedPaymentArg(tx, amountUnits, walletAddress!, {
            bmId: currentBmId,
            maId: maAccountId ?? null,
            maBalance: maAccount?.nusdcBalance ?? 0n,
            client,
          });
          buildMintOutcomeTokens(tx, marketId, amountUnits, paymentArg);
        },
        'YES + NO tokens minted',
        { useNusdcLock: true },
      ),
    [runOperation, walletAddress, maAccountId, maAccount?.nusdcBalance],
  );

  const cancelOrder = useCallback(
    (marketId: string, isYes: boolean, isBid: boolean, priceBps: number, orderId: number | bigint) =>
      runOperation(
        marketId,
        `cancel:${orderId}`,
        (tx) => buildCancelOrder(tx, marketId, isYes, isBid, priceBps, orderId),
        'Order cancelled',
      ),
    [runOperation],
  );

  const claimRestingOrderRefund = useCallback(
    (marketId: string, isYes: boolean, isBid: boolean, priceBps: number, orderId: number | bigint) =>
      runOperation(
        marketId,
        `claim-resting:${orderId}`,
        (tx) => buildClaimRestingOrderRefund(tx, marketId, isYes, isBid, priceBps, orderId),
        'Resting order refunded',
      ),
    [runOperation],
  );

  const cancelExpiredMarket = useCallback(
    (marketId: string) =>
      runOperation(
        marketId,
        'cancel-expired',
        (tx) => buildCancelExpiredMarket(tx, marketId),
        'Market cancelled — refunds now claimable',
        { invalidateMarketsList: true },
      ),
    [runOperation],
  );

  const claimCancelledRefund = useCallback(
    (marketId: string, positionId: string) =>
      runOperation(
        marketId,
        `claim-cancelled:${positionId}`,
        (tx) => buildClaimCancelledRefund(tx, marketId, positionId),
        'Cancelled-market refund claimed',
      ),
    [runOperation],
  );

  const claimWinnings = useCallback(
    (marketId: string, positionId: string) =>
      runOperation(
        marketId,
        `claim-winnings:${positionId}`,
        (tx) => buildClaimWinnings(tx, marketId, positionId),
        'Winnings claimed',
      ),
    [runOperation],
  );

  const burnLosingPosition = useCallback(
    (marketId: string, positionId: string) =>
      runOperation(
        marketId,
        `burn:${positionId}`,
        (tx) => buildBurnLosingPosition(tx, marketId, positionId),
        'Losing position cleared',
      ),
    [runOperation],
  );

  /**
   * Round-7 R7-C2 (Phase A): claim every resting order refund in one PTB.
   *
   * On a resolved market, claiming a resting *ask* order MINTS a new Position
   * via `transfer::transfer` (Move source: prediction_market.move:870-908).
   * That Position cannot be consumed by `claim_winnings`/`burn_losing_position`
   * within the same PTB because PTB inputs are fixed at build time. So Phase A
   * collects refunds + new Positions, then the caller refetches positions and
   * runs `settlePositionsBatch` (Phase B).
   *
   * Bid-side resting orders only return NUSDC; they do not mint Positions.
   */
  const claimRestingRefundsBatch = useCallback(
    (
      marketId: string,
      restingOrders: Array<{ isYes: boolean; isBid: boolean; priceBps: number; orderId: number | bigint }>,
    ) =>
      runOperation(
        marketId,
        'recover:phase-a',
        (tx) => {
          for (const o of restingOrders) {
            buildClaimRestingOrderRefund(tx, marketId, o.isYes, o.isBid, o.priceBps, o.orderId);
          }
        },
        'Step 1/2: resting refunds claimed',
      ),
    [runOperation],
  );

  /**
   * Round-7 R7-C2 (Phase B): settle every Position in one PTB.
   *
   * After Phase A indexes, the caller refetches positions (now including any
   * freshly-minted Positions from ask-side refunds) and passes them all here.
   */
  const settlePositionsBatch = useCallback(
    (marketId: string, positions: Array<{ positionId: string; won: boolean }>) =>
      runOperation(
        marketId,
        'recover:phase-b',
        (tx) => {
          for (const p of positions) {
            if (p.won) {
              buildClaimWinnings(tx, marketId, p.positionId);
            } else {
              buildBurnLosingPosition(tx, marketId, p.positionId);
            }
          }
        },
        'Step 2/2: positions settled',
      ),
    [runOperation],
  );

  /**
   * Create a BalanceManager for the connected wallet (tx1 of first-trade two-tx flow).
   * Stores the new BM ID in localStorage and the shared Zustand store so subsequent
   * placeBuyTaker calls route through it automatically.
   */
  const createPadoAccount = useCallback(async (): Promise<{ success: boolean; digest?: string; error?: string; newBmId?: string }> => {
    if (!walletAddress) return { success: false, error: 'Wallet not connected' };
    setIsLoading(true);
    try {
      const tx = buildCreateBalanceManager();
      const result = await signAndExecute(tx, { showObjectChanges: true });
      const created = result.objectChanges?.find(
        (c) => c.type === 'created' && 'objectType' in c &&
          (c as { objectType?: string }).objectType?.includes('BalanceManager'),
      );
      const newBmId = (created && 'objectId' in created)
        ? (created as { objectId: string }).objectId
        : undefined;
      if (!newBmId) {
        return { success: false, error: 'Account created but ID not found. Please refresh.' };
      }
      storeBalanceManagerId(walletAddress, newBmId);
      setBalanceManagerId(newBmId);
      invalidateBalances();
      return { success: true, digest: result.digest, newBmId };
    } catch (err) {
      const message = parseTradeError(err);
      showToast(message, 'error');
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, signAndExecute, showToast, setBalanceManagerId, invalidateBalances]);

  const requestNusdc = useCallback(async (): Promise<TradeResult> => {
    if (!isWalletConnected) {
      showToast('Please connect your wallet', 'error');
      return { success: false, error: 'Wallet not connected' };
    }
    setIsFaucetLoading(true);
    try {
      const tx = buildNusdcFaucetTx();
      const result = await signAndExecute(tx);
      showToast('100,000 NUSDC received', 'success');
      invalidateBalances();
      return { success: true, digest: result.digest };
    } catch (err) {
      const message = parseTradeError(err);
      showToast(message, 'error');
      return { success: false, error: message };
    } finally {
      setIsFaucetLoading(false);
    }
  }, [isWalletConnected, signAndExecute, showToast, invalidateBalances]);

  return {
    isLoading,
    isFaucetLoading,
    error,
    bmId,
    createPadoAccount,
    placeBuyTaker,
    placeSellTaker,
    placeBuyMaker,
    placeSellMaker,
    mintTokens,
    cancelOrder,
    claimRestingOrderRefund,
    cancelExpiredMarket,
    claimCancelledRefund,
    claimWinnings,
    burnLosingPosition,
    claimRestingRefundsBatch,
    settlePositionsBatch,
    requestNusdc,
  };
}

// Helper: convert human NUSDC (e.g. 100) to base units (bigint).
export function nusdcUnits(amount: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, NUSDC_DECIMALS)));
}
