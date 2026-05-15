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
import { assembleUnifiedPaymentArg, assembleAutoDepositPaymentArg } from '../../../lib/payment';
import { useMarginAccount } from '../../core/unified-margin';
import { useToast } from '@/components/common/Toast';
import { NUSDC_DECIMALS } from '../constants';
import { applyOptimisticTrade, parseFillsFromEvents } from '../lib/optimistic-update';
import type { OpenOrderRow } from './useMyOpenOrders';

interface TradeResult {
  success: boolean;
  digest?: string;
  error?: string;
  /**
   * Sum of `fill_shares` across OrderFilled events where the user was taker.
   * u64 shares with 6 decimals (matching NUSDC). Undefined when the receipt
   * had no events or the op was a non-trade (cancel/claim/burn).
   */
  filledShares?: bigint;
  /** Sum of `cost` across the same user-taker fills (u64, 6 decimals). */
  filledCost?: bigint;
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
  settleRefundsBatch: (
    marketId: string,
    positionIds: string[],
  ) => Promise<TradeResult>;
  settleMultiMarketBatch: (
    items: Array<{ marketId: string; positionId: string; kind: 'claim' | 'burn' | 'refund' }>,
  ) => Promise<TradeResult>;

  placeBuyTaker: (
    marketId: string,
    isYes: boolean,
    maxPriceBps: number,
    restOnNoFill: boolean,
    amountUnits: bigint,
  ) => Promise<TradeResult>;
  /**
   * Same as placeBuyTaker but pre-funds MA with `shortfallUnits` from the
   * connected wallet in a single atomic PTB before placing the order. Used by
   * the prediction auto-deposit toggle when displayed Pado Balance is short.
   */
  placeBuyTakerWithAutoDeposit: (
    marketId: string,
    isYes: boolean,
    maxPriceBps: number,
    restOnNoFill: boolean,
    amountUnits: bigint,
    shortfallUnits: bigint,
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

// Abort codes that indicate the market's on-chain status changed while the
// user had the page open (resolved, cancelled, or expired).
const STALE_MARKET_ABORT_CODES = new Set([0, 2, 10, 15]); // EMarketNotOpen, EMarketAlreadyResolved, EMarketExpired, EMarketAlreadyCancelled

function getMoveAbortCode(error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.match(/MoveAbort[^,]*,\s*(\d+)/);
  return m ? parseInt(m[1]) : null;
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

  // Parse MoveAbort: extract module name + abort code.
  // Sui error format: MoveAbort(MoveLocation { module: ModuleId { address: 0x..., name: Identifier("module_name") }, ... }, CODE)
  // We must extract module first so we don't mismap abort codes from other contracts
  // (e.g. unified_margin::EInsufficientBalance = 0 must not become "Market is not open").
  const moveAbortFull = message.match(/MoveAbort\(.*?Identifier\("([^"]+)"\).*?,\s*(\d+)\)/s)
    || message.match(/MoveAbort[^,]*::([a-z_]+)::[^,]+,\s*(\d+)/);
  const moveAbortCodeOnly = message.match(/MoveAbort[^,]*,\s*(\d+)/);

  const abortModule = moveAbortFull?.[1] ?? null;
  const abortCodeStr = moveAbortFull?.[2] ?? moveAbortCodeOnly?.[1] ?? null;

  if (abortCodeStr !== null) {
    const code = parseInt(abortCodeStr);

    // unified_margin abort codes (EInsufficientBalance=0, EZeroAmount=1, ENotOwner=2, ...)
    if (abortModule === 'unified_margin') {
      switch (code) {
        case 0: return 'Insufficient balance in Pado Balance. Please deposit more NUSDC.';
        case 1: return 'Amount cannot be zero.';
        case 2: return 'You do not own this account.';
        default: return `Pado Balance error (code: ${code}). Please try again.`;
      }
    }

    // balance_manager (DeepBook) abort codes
    if (abortModule === 'balance_manager') {
      return 'Insufficient balance. Please check your Pado Balance.';
    }

    // prediction_market abort codes — only apply when from the correct module or unidentified
    if (abortModule === 'prediction_market' || abortModule === null) {
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
        case 12: return 'Resolve deadline has passed. This market can no longer be resolved.';
        case 13: return 'Market has not expired yet. Wait until after the resolve deadline.';
        case 14: return 'Market is not cancelled.';
        case 15: return 'Market has already been cancelled.';
        case 16: return 'Creator and resolver addresses must differ.';
        case 17: return 'Invalid input. Check amount, price, and time settings.';
        case 18: return 'Order is too large to fill in one transaction. Try smaller size or different price.';
        case 19: return 'The orderbook is empty on the opposite side right now -- there are no resting orders to match. Try a Limit order, or wait for someone to add liquidity.';
        case 20: return 'Order not found. It may have been filled or cancelled.';
        case 100: return 'Price moved too much during your order. Refresh the orderbook and try again.';
        case 101: return 'Trade value cannot be zero.';
        default: return `Transaction failed (code: ${code}). Please try again.`;
      }
    }

    return `Transaction failed (code: ${code}). Please try again.`;
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
  const { accountId: maAccountId, account: maAccount } = useMarginAccount();

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
    async (tx: Transaction, opts: { showObjectChanges?: boolean; showEvents?: boolean } = {}) => {
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
        options: {
          showEffects: true,
          showObjectChanges: opts.showObjectChanges,
          showEvents: opts.showEvents,
        },
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
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['prediction', 'market', marketId] });
        queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', marketId, 'yes'] });
        queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', marketId, 'no'] });
        // Recent-fills hook split: market-wide (shared) + my-fills (per-user).
        queryClient.invalidateQueries({ queryKey: ['prediction', 'market-fills', marketId] });
        if (addr) {
          // Wallet-scoped positions: hook reads with optional marketId filter,
          // so invalidating just the wallet-level prefix matches both
          // (`['prediction-positions', addr]` and `[..., addr, marketId]`).
          queryClient.invalidateQueries({ queryKey: ['prediction-positions', addr] });
          queryClient.invalidateQueries({ queryKey: ['prediction', 'my-orders', marketId, addr] });
          queryClient.invalidateQueries({ queryKey: ['prediction', 'my-trade-history', marketId, addr] });
          queryClient.invalidateQueries({ queryKey: ['prediction', 'my-fills', marketId, addr] });
        }
        if (alsoInvalidateMarketsList) {
          queryClient.invalidateQueries({ queryKey: ['prediction-markets-with-orderbooks'] });
        }
      };

      // EventService bridge handles event-driven invalidation (5s polling
      // tick). The trade-flow invalidate is a safety net for Sui's
      // owned-objects indexer (Position NFTs), which lags 5-8s post-tx.
      // Two-cycle (immediate + 5s) is enough; the previous 4-cycle (0/1.5/
      // 4/8s) wave-of-refetches piled on top of EventService for no benefit.
      invalidate();
      setTimeout(invalidate, 5_000);
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

      // Retry once on stale-version errors. These happen when the LP bot ticks
      // (or another taker fills) between dryRun and submit, bumping a referenced
      // object's version. Rebuilding the tx pulls fresh refs from chain.
      const isStaleVersionError = (err: unknown): boolean => {
        const msg = err instanceof Error ? err.message : String(err);
        return (
          msg.includes('is not available for consumption') ||
          msg.includes('ObjectVersionUnavailableForConsumption') ||
          msg.includes('Object ID') && msg.includes('Version')
        );
      };

      const attempt = async (): Promise<TradeResult & { _retriable?: boolean; _staleMarket?: boolean }> => {
        try {
          const tx = new Transaction();
          const client = getSuiClient();
          await build(tx, client);
          // Events + objectChanges are needed for optimistic cache injection
          // (apply post-success). They add a small response payload but unlock
          // <300ms perceived freshness on Recent Trades / My Positions.
          const result = await signAndExecute(tx, { showEvents: true, showObjectChanges: true });
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
          // Optimistic update BEFORE invalidate so the synthesized rows are in
          // place when any in-flight refetch from invalidate completes (real
          // rows dedupe-merge over pending rows by stable key).
          if (walletAddress) {
            try {
              applyOptimisticTrade({
                queryClient,
                client,
                marketId,
                myAddress: walletAddress,
                receipt: result,
              });
            } catch (e) {
              // Non-fatal: optimistic UI is a perf optimization, the invalidate
              // path below still produces correct state.
              if (import.meta.env.DEV) console.warn('[prediction trade] optimistic apply failed:', e);
            }
          }
          invalidateMarketScoped(marketId, opts.invalidateMarketsList);
          invalidateBalances();
          // Parse user-side filled shares from OrderFilled events so the
          // success UI can show actual filled amount instead of pre-trade
          // estimate. parseFillsFromEvents already drops zero-cost bookkeeping
          // rows, so summing here matches what the indexer will eventually
          // produce for `my-fills`.
          let filledShares: bigint | undefined;
          let filledCost: bigint | undefined;
          if (walletAddress && result.events) {
            const lc = walletAddress.toLowerCase();
            const userFills = parseFillsFromEvents(result.events, marketId)
              .filter((f) => f.taker.toLowerCase() === lc);
            if (userFills.length > 0) {
              filledShares = userFills.reduce((s, f) => s + f.fillShares, 0n);
              filledCost = userFills.reduce((s, f) => s + f.cost, 0n);
            } else {
              filledShares = 0n;
              filledCost = 0n;
            }
          }
          return { success: true, digest: result.digest, filledShares, filledCost };
        } catch (err) {
          if (import.meta.env.DEV) console.error('[prediction trade] raw error:', err);
          if (isStaleVersionError(err)) {
            return { success: false, error: 'stale-version', _retriable: true };
          }
          const abortCode = getMoveAbortCode(err);
          const message = parseTradeError(err);
          return { success: false, error: message, _staleMarket: abortCode !== null && STALE_MARKET_ABORT_CODES.has(abortCode) };
        }
      };

      const exec = async (): Promise<TradeResult> => {
        const first = await attempt();
        if (first.success || !first._retriable) {
          if (!first.success) {
            setError(first.error!);
            showToast(first.error!, 'error');
            // Always refresh balances on failure so the next attempt uses fresh MA/BM data.
            invalidateBalances();
            if (first._staleMarket) {
              invalidateMarketScoped(marketId, true);
            }
          }
          return {
            success: first.success,
            digest: first.digest,
            error: first.error,
            filledShares: first.filledShares,
            filledCost: first.filledCost,
          };
        }
        // Stale-version retry: invalidate caches, brief settle delay, then one more shot.
        invalidateBalances();
        invalidateMarketScoped(marketId, false);
        await new Promise((r) => setTimeout(r, 400));
        const second = await attempt();
        if (!second.success) {
          const msg = second._retriable
            ? 'Network busy, please try again.'
            : second.error!;
          setError(msg);
          showToast(msg, 'error');
          invalidateBalances();
          if (second._staleMarket) {
            invalidateMarketScoped(marketId, true);
          }
          return { success: false, error: msg };
        }
        return {
          success: true,
          digest: second.digest,
          filledShares: second.filledShares,
          filledCost: second.filledCost,
        };
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
    [isWalletConnected, walletAddress, signAndExecute, showToast, invalidateMarketScoped, invalidateBalances, queryClient],
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
            client,
          });
          buildPlaceBuyTaker(tx, marketId, isYes, maxPriceBps, restOnNoFill, amountUnits, paymentArg);
        },
        restOnNoFill ? 'Limit buy submitted' : 'Buy filled',
        { useNusdcLock: true },
      ),
    [runOperation, walletAddress, maAccountId],
  );

  const placeBuyTakerWithAutoDeposit = useCallback(
    (
      marketId: string,
      isYes: boolean,
      maxPriceBps: number,
      restOnNoFill: boolean,
      amountUnits: bigint,
    ) =>
      runOperation(
        marketId,
        `buy-taker-autodeposit:${isYes}`,
        async (tx, client) => {
          if (!maAccountId) {
            throw new Error('Pado Balance account required for auto-deposit. Please set up Pado Balance first.');
          }
          const paymentArg = await assembleAutoDepositPaymentArg(
            tx,
            amountUnits,
            walletAddress!,
            maAccountId,
            client,
            maAccount?.nusdcBalance ?? 0n,
          );
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
            client,
          });
          buildPlaceBuyMaker(tx, marketId, isYes, priceBps, amountUnits, paymentArg);
        },
        'Limit buy resting',
        { useNusdcLock: true },
      ),
    [runOperation, walletAddress, maAccountId],
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
            client,
          });
          buildMintOutcomeTokens(tx, marketId, amountUnits, paymentArg);
        },
        'YES + NO tokens minted',
        { useNusdcLock: true },
      ),
    [runOperation, walletAddress, maAccountId],
  );

  const cancelOrder = useCallback(
    async (marketId: string, isYes: boolean, isBid: boolean, priceBps: number, orderId: number | bigint) => {
      // Optimistic: drop the order from the cached list now so the UI updates
      // before the tx confirms. Restored on failure.
      const addr = walletAddress;
      const queryKey = ['prediction', 'my-orders', marketId, addr] as const;
      const snapshot = addr
        ? queryClient.getQueryData<OpenOrderRow[]>(queryKey)
        : undefined;
      const targetId = Number(orderId);
      if (snapshot) {
        queryClient.setQueryData<OpenOrderRow[]>(
          queryKey,
          snapshot.filter((o) => o.orderId !== targetId),
        );
      }
      const result = await runOperation(
        marketId,
        `cancel:${orderId}`,
        (tx) => buildCancelOrder(tx, marketId, isYes, isBid, priceBps, orderId),
        'Order cancelled',
      );
      if (!result.success && snapshot) {
        queryClient.setQueryData(queryKey, snapshot);
      }
      return result;
    },
    [runOperation, queryClient, walletAddress],
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
          // Gas budget scales with chunk size so a 100-Position chunk does not
          // get capped at the default dry-run estimate. Numbers are conservative
          // first-cut; tune from `[claim-all]` console telemetry.
          const BASE_BUDGET = 50_000_000;
          const PER_POSITION = 3_000_000;
          tx.setGasBudget(BASE_BUDGET + PER_POSITION * positions.length);
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
   * Bulk-claim refunds across positions in a cancelled market in a single PTB.
   * Mirrors `settlePositionsBatch` but targets `buildClaimCancelledRefund`. The
   * caller is responsible for chunking (PTB input-object cap) and refetching
   * positions afterwards.
   */
  const settleRefundsBatch = useCallback(
    (marketId: string, positionIds: string[]) =>
      runOperation(
        marketId,
        'refund:batch',
        (tx) => {
          const BASE_BUDGET = 50_000_000;
          const PER_POSITION = 3_000_000;
          tx.setGasBudget(BASE_BUDGET + PER_POSITION * positionIds.length);
          for (const id of positionIds) {
            buildClaimCancelledRefund(tx, marketId, id);
          }
        },
        'Refunds claimed',
      ),
    [runOperation],
  );

  /**
   * Bulk-settle positions across multiple markets in a single PTB. One wallet
   * signature handles claim/burn/refund operations regardless of which market
   * each position belongs to. Sui's PTB dedupes shared-object inputs, so unique
   * markets become unique input slots; 19 inputs for 6 markets + 13 positions
   * is far under the ~2048 input cap. The caller is responsible for chunking
   * if `items.length` exceeds the PTB command/input limit.
   *
   * Note: runOperation's optimistic update + per-market invalidation key off
   * the *first* marketId, so optimistic UI is best-effort for the remaining
   * markets — full correctness comes from the caller's refetchPositions().
   */
  const settleMultiMarketBatch = useCallback(
    (items: Array<{ marketId: string; positionId: string; kind: 'claim' | 'burn' | 'refund' }>) => {
      if (items.length === 0) {
        return Promise.resolve({ success: true } as TradeResult);
      }
      return runOperation(
        items[0].marketId,
        `multi-settle:${items.length}`,
        (tx) => {
          const BASE_BUDGET = 50_000_000;
          const PER_ACTION = 3_000_000;
          tx.setGasBudget(BASE_BUDGET + PER_ACTION * items.length);
          for (const it of items) {
            if (it.kind === 'claim') {
              buildClaimWinnings(tx, it.marketId, it.positionId);
            } else if (it.kind === 'burn') {
              buildBurnLosingPosition(tx, it.marketId, it.positionId);
            } else {
              buildClaimCancelledRefund(tx, it.marketId, it.positionId);
            }
          }
        },
        `Settled ${items.length} position${items.length === 1 ? '' : 's'}`,
      );
    },
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
    placeBuyTakerWithAutoDeposit,
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
    settleRefundsBatch,
    settleMultiMarketBatch,
    requestNusdc,
  };
}

// Helper: convert human NUSDC (e.g. 100) to base units (bigint).
export function nusdcUnits(amount: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, NUSDC_DECIMALS)));
}
