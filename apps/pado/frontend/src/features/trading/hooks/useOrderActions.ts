/**
 * useOrderActions Hook
 * 주문 실행 래퍼 (useTrading + Toast 통합)
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from "@tanstack/react-query";
import type { Transaction } from '@mysten/sui/transactions';
import { useTrading } from "../useTrading";
import { useMarket } from "../context/MarketContext";
import { useOrderForm } from "../context/OrderFormContext";
import { useAutoDeposit } from "./useAutoDeposit";
import { useMarginAccount } from "../../core/unified-margin/useMarginAccount";
import type { TradeResult, OrderType } from "../types";
import { ORDER_TYPE } from "../constants";
import { useToast } from "@/components/common";
import { playSound } from "../../../lib/sounds";
import { priceToRaw, quantityToRaw, getMinQuantity, getMinPrice } from "../../../lib/deepbook";
import { isMarginError } from "../../../lib/risk-engine";
import { parseError } from "../utils/errorParser";
import { RPC_SYNC_DELAY_MS, MARKET_ORDER_SLIPPAGE_BUFFER } from "../../../lib/constants";
import { getUnifiedPrice } from "../../../lib/prices";
import { withdrawNusdcFromMa } from "../../../lib/payment";
import { NETWORK_CONFIG } from "../../../config/network";
import { parseExecutionInfo } from "../lib/parseExecutionInfo";
import type { AutoDepositResult } from "./useAutoDeposit";

/**
 * Shared auto-deposit helper to avoid duplication between limit and market order handlers.
 * Returns { success: true } if deposit succeeded or was not needed.
 */
async function performAutoDeposit(
  depositIfNeeded: (q: number, b: number) => Promise<AutoDepositResult>,
  requiredQuote: number,
  requiredBase: number,
  showToast: (msg: string, type: "info" | "error" | "success" | "warning") => void,
  baseSymbol: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await depositIfNeeded(requiredQuote, requiredBase);

  if (!result.success) {
    const error = result.error || "Auto deposit failed";
    showToast(error, "error");
    return { success: false, error };
  }

  const hasQuote = (result.depositedQuoteAmount ?? 0) > 0;
  const hasBase = (result.depositedBaseAmount ?? 0) > 0;

  if (hasQuote) {
    showToast(`Auto-deposited ${result.depositedQuoteAmount!.toFixed(2)} NUSDC to trading`, "info");
  }
  if (hasBase) {
    showToast(`Auto-deposited ${result.depositedBaseAmount!.toFixed(4)} ${baseSymbol} to trading`, "info");
  }
  if (hasQuote || hasBase) {
    await new Promise((resolve) => setTimeout(resolve, RPC_SYNC_DELAY_MS));
  }

  return { success: true };
}

export interface UseOrderActionsResult {
  isLoading: boolean;
  isValidatingBalanceManager: boolean;
  balanceManagerId: string | null;

  // Auto deposit runtime state
  isAutoDepositing: boolean;
  lastAutoDepositError: string | null;

  // 주문 실행
  handleLimitOrder: (
    type: "buy" | "sell",
    price: number,
    amount: number,
    orderType?: OrderType,
    skipRefresh?: boolean
  ) => Promise<TradeResult>;
  handleMarketOrder: (type: "buy" | "sell", amount: number) => Promise<TradeResult>;
  handleCancelOrder: (orderId: string) => Promise<TradeResult>;
  handleCancelAllOrders: (orderIds: string[]) => Promise<TradeResult>;

  // BalanceManager 관리
  handleCreateBalanceManager: () => Promise<TradeResult>;
  handleDeposit: () => Promise<TradeResult>;
  handleWithdraw: () => Promise<TradeResult>;

  // Per-token deposit/withdraw
  handleDepositToken: (amount: number, coinType: string, decimals: number, symbol: string) => Promise<TradeResult>;
  handleWithdrawToken: (amount: number, coinType: string, decimals: number, symbol: string) => Promise<TradeResult>;

  refreshData: () => void;
}

/**
 * 체결 결과 메시지 포맷팅
 */
function formatOrderResult(result: TradeResult, isBid: boolean, feeBps?: number): string {
  const action = isBid ? "Buy" : "Sell";
  const exec = result.executionInfo;

  if (!exec) {
    return `${action} Limit placed — Tx: ${result.digest?.slice(0, 10)}...`;
  }

  const priceStr = exec.avgPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (exec.status === "filled") {
    let msg = `${action} FILLED ${exec.executedQuantity.toFixed(4)} @ $${priceStr}`;
    if (feeBps && exec.executedQuote > 0) {
      const fee = exec.executedQuote * feeBps / 10000;
      msg += ` // Fee: ~$${fee.toFixed(2)}`;
    }
    return msg + ' (in Pado)';
  } else if (exec.status === "partial") {
    const totalQty = exec.executedQuantity + exec.remainingQuantity;
    return `${action} PARTIAL ${exec.executedQuantity.toFixed(4)}/${totalQty.toFixed(4)} @ $${priceStr} (in Pado)`;
  }

  return `${action} Limit placed — Tx: ${result.digest?.slice(0, 10)}...`;
}

export function useOrderActions(): UseOrderActionsResult {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { currentPool } = useMarket();
  const {
    isLoading,
    isValidatingBalanceManager,
    balanceManagerId,
    placeLimitOrder,
    placeBuyOrder,
    placeSellOrder,
    placeMarketOrder,
    cancelOrder,
    cancelAllOrders,
    createBalanceManager,
    depositAllTokens,
    withdrawAllTokens,
    depositToken,
    withdrawToken,
  } = useTrading();

  const [isEnabling, setIsEnabling] = useState(false);

  // Auto deposit setting from context
  const { autoDepositEnabled } = useOrderForm();

  // Auto deposit hook
  const {
    depositIfNeeded,
    isDepositing: isAutoDepositing,
    lastDepositError: lastAutoDepositError,
  } = useAutoDeposit(balanceManagerId);

  // Margin account for unified onboarding and MA-first routing
  const {
    hasAccount: hasMarginAccount,
    createAccount: createMarginAccount,
    account: marginAccount,
    accountId: marginAccountId,
  } = useMarginAccount();

  // Convert error message to user-friendly format
  const formatUserFriendlyError = useCallback(
    (error: string | undefined, context?: { side?: 'buy' | 'sell'; requiredAmount?: number; availableAmount?: number }): string => {
      if (!error) return "Unknown error";

      const minQty = getMinQuantity(currentPool);
      const minPrice = getMinPrice(currentPool);
      const baseSymbol = currentPool.baseToken.symbol;

      // Parse error to get type and code
      const parsed = parseError(error);

      // Gas-related errors
      if (parsed.errorType === "GAS_REQUIRED") {
        return "Not enough NSN for gas. Get NSN from Faucet in your wallet.";
      }

      // Use parsed code for reliable matching (raw error strings don't contain these codes)
      if (parsed.code) {
        // Price errors: ORDER_INFO-0 (tick size) or POOL-2
        if (parsed.code === "ORDER_INFO-0" || parsed.code === "POOL-2") {
          return `Price must be a multiple of $${minPrice}`;
        }

        // Quantity errors: ORDER_INFO-1 (min size) or ORDER_INFO-2 (lot size)
        if (parsed.code === "ORDER_INFO-1") {
          return `Order too small. Minimum size: ${minQty} ${baseSymbol}`;
        }
        if (parsed.code === "ORDER_INFO-2") {
          return `Invalid quantity. Use multiples of ${minQty} ${baseSymbol}`;
        }

        // Expired order: ORDER_INFO-3
        if (parsed.code === "ORDER_INFO-3") {
          return "Order expired. Please try again.";
        }

        // Post-only: ORDER_INFO-5 or POOL-6
        if (parsed.code === "ORDER_INFO-5" || parsed.code === "POOL-6") {
          return "Post-only rejected: order would fill immediately. Adjust price further from market.";
        }

        // FOK: ORDER_INFO-6
        if (parsed.code === "ORDER_INFO-6") {
          return "Fill-or-Kill order cannot be fully filled at current prices.";
        }

        // Insufficient balance: BM-3
        if (parsed.code === "BM-3") {
          if (context?.requiredAmount !== undefined && context?.availableAmount !== undefined) {
            const tokenSymbol = context.side === 'sell' ? baseSymbol : currentPool.quoteToken.symbol;
            const decimals = context.side === 'sell' ? 4 : 2;
            return `Insufficient ${tokenSymbol}. Need ${context.requiredAmount.toFixed(decimals)}, have ${context.availableAmount.toFixed(decimals)}. Get tokens from Faucet.`;
          }
          return "Not enough balance. Get tokens from Faucet in your wallet.";
        }
      }

      // Fallback: check raw string patterns
      if (error.includes("Insufficient balance") || error.includes("BM-3")) {
        return "Not enough balance. Get tokens from Faucet in your wallet.";
      }

      // Insufficient margin (Pado Balance)
      if (isMarginError(error)) {
        return "Not enough margin. Deposit more NUSDC or reduce order size.";
      }

      // If parseError found a known error, use its message
      if (parsed.isKnown) {
        return parsed.message;
      }

      return error;
    },
    [currentPool]
  );

  // 데이터 갱신 헬퍼
  const refreshData = useCallback(() => {
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["openOrders"] });
      queryClient.invalidateQueries({ queryKey: ["balance-manager-balance"] });
      queryClient.invalidateQueries({ queryKey: ["bm-balance-global"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-multi-balance"] });
      queryClient.invalidateQueries({ queryKey: ["orderbook"] });
      queryClient.invalidateQueries({ queryKey: ["orderHistory"] });
      queryClient.invalidateQueries({ queryKey: ["sender-events"] });
      queryClient.invalidateQueries({ queryKey: ["margin-account"] });
    }, 2000);
  }, [queryClient]);

  // 지정가 주문 실행 (with auto deposit)
  const handleLimitOrder = useCallback(
    async (
      type: "buy" | "sell",
      price: number,
      amount: number,
      orderType: OrderType = ORDER_TYPE.NO_RESTRICTION,
      skipRefresh = false
    ): Promise<TradeResult> => {
      // MA-first: buy orders only (NUSDC quote). If MA has sufficient balance,
      // inject MA withdraw + BM deposit as PTB pre-steps for a single atomic tx.
      if (type === "buy" && marginAccountId && balanceManagerId && currentPool.quoteToken.type) {
        const maBalance = marginAccount?.nusdcBalance ?? 0n;
        // Use toFixed-based string conversion to avoid JS float precision loss
        // (BigInt(Math.ceil(float * 10^n)) can produce off-by-one errors near integer boundaries)
        const totalQuote = price * amount;
        const dec = currentPool.quoteToken.decimals;
        const [intPart, fracPart = ''] = totalQuote.toFixed(dec).split('.');
        const rawRequired = BigInt(intPart + fracPart.padEnd(dec, '0').slice(0, dec));
        if (rawRequired > 0n && maBalance >= rawRequired) {
          const maId = marginAccountId;
          const bmId = balanceManagerId;
          const quoteType = currentPool.quoteToken.type;
          const preSteps = (tx: Transaction) => {
            const coinArg = withdrawNusdcFromMa(tx, maId, rawRequired);
            tx.moveCall({
              target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
              typeArguments: [quoteType],
              arguments: [tx.object(bmId), coinArg],
            });
          };
          const rawPrice = priceToRaw(price, currentPool.quoteToken.decimals);
          const rawQuantity = quantityToRaw(amount, currentPool.baseToken.decimals);
          const result = await placeLimitOrder({ price: rawPrice, quantity: rawQuantity, isBid: true, orderType, preSteps });
          if (result.success) {
            playSound('orderPlaced');
            const executionInfo = result.events
              ? parseExecutionInfo(result.events, amount, true, currentPool.baseToken.decimals, currentPool.quoteToken.decimals) ?? undefined
              : undefined;
            const withExec = executionInfo ? { ...result, executionInfo } : result;
            showToast(formatOrderResult(withExec, true, currentPool.takerFeeBps), "success");
            if (!skipRefresh) refreshData();
            return withExec;
          } else {
            // UNIFIED_MARGIN-0 = EInsufficientBalance: cached MA balance was stale.
            // Fall through to wallet auto-deposit path instead of surfacing the error.
            const parsedMaErr = parseError(result.error);
            if (parsedMaErr.code !== 'UNIFIED_MARGIN-0') {
              playSound('error');
              showToast(formatUserFriendlyError(result.error, { side: "buy", requiredAmount: price * amount, availableAmount: 0 }), "error");
              return result;
            }
          }
        }
      }

      // Sell side or MA insufficient: fall back to wallet auto-deposit flow
      if (autoDepositEnabled && balanceManagerId) {
        const requiredQuote = type === "buy" ? price * amount : 0;
        const requiredBase = type === "sell" ? amount : 0;
        const deposit = await performAutoDeposit(depositIfNeeded, requiredQuote, requiredBase, showToast, currentPool.baseToken.symbol);
        if (!deposit.success) return { success: false, error: deposit.error };
      }

      // Place the order
      const result =
        type === "buy"
          ? await placeBuyOrder(price, amount, orderType)
          : await placeSellOrder(price, amount, orderType);

      if (result.success) {
        playSound('orderPlaced');
        const message = formatOrderResult(result, type === "buy", currentPool.takerFeeBps);
        showToast(message, "success");
        if (!skipRefresh) refreshData();
      } else {
        playSound('error');
        const requiredQuote = type === "buy" ? price * amount : 0;
        const requiredBase = type === "sell" ? amount : 0;
        const friendlyError = formatUserFriendlyError(result.error, {
          side: type,
          requiredAmount: type === "buy" ? requiredQuote : requiredBase,
          availableAmount: 0,
        });
        showToast(friendlyError, "error");
      }

      return result;
    },
    [
      autoDepositEnabled,
      balanceManagerId,
      marginAccountId,
      marginAccount,
      depositIfNeeded,
      placeLimitOrder,
      placeBuyOrder,
      placeSellOrder,
      showToast,
      refreshData,
      formatUserFriendlyError,
      currentPool,
    ]
  );

  // 시장가 주문 실행 (with auto deposit)
  const handleMarketOrder = useCallback(
    async (type: "buy" | "sell", amount: number): Promise<TradeResult> => {
      // MA-first is limit-order only. Market orders use slippage-buffered estimated cost
      // so the exact withdrawal amount is unknown; use wallet auto-deposit fallback instead.
      const baseSymbol = currentPool.baseToken.symbol;
      const oraclePrice = getUnifiedPrice(baseSymbol as Parameters<typeof getUnifiedPrice>[0]);
      const estimatedPrice = oraclePrice > 0 ? oraclePrice * MARKET_ORDER_SLIPPAGE_BUFFER : 100000;

      if (autoDepositEnabled && balanceManagerId) {
        const requiredQuote = type === "buy" ? estimatedPrice * amount : 0;
        const requiredBase = type === "sell" ? amount : 0;
        const deposit = await performAutoDeposit(depositIfNeeded, requiredQuote, requiredBase, showToast, baseSymbol);
        if (!deposit.success) return { success: false, error: deposit.error };
      }

      const rawQuantity = quantityToRaw(amount, currentPool.baseToken.decimals);
      const result = await placeMarketOrder({
        quantity: rawQuantity,
        isBid: type === "buy",
      });

      if (result.success) {
        playSound('orderFilled');
        const msg = result.executionInfo
          ? formatOrderResult(result, type === "buy", currentPool.takerFeeBps)
          : `Market ${type === "buy" ? "Buy" : "Sell"} ${amount.toFixed(4)} ${baseSymbol} executed! (in Pado)`;
        showToast(msg, "success");
        refreshData();
      } else {
        playSound('error');
        const friendlyError = formatUserFriendlyError(result.error, {
          side: type,
          requiredAmount: amount,
          availableAmount: 0,
        });
        showToast(friendlyError, "error");
      }

      return result;
    },
    [
      autoDepositEnabled,
      balanceManagerId,
      depositIfNeeded,
      placeMarketOrder,
      showToast,
      refreshData,
      formatUserFriendlyError,
      currentPool,
    ]
  );

  // 주문 취소
  const handleCancelOrder = useCallback(
    async (orderId: string): Promise<TradeResult> => {
      const result = await cancelOrder(orderId);

      if (result.success) {
        showToast("Order cancelled successfully", "success");
        refreshData();
      } else {
        const parsed = parseError(result.error);
        if (parsed.errorType === 'ORDER_NOT_FOUND') {
          showToast("Order already filled or cancelled", "warning");
        } else {
          showToast(formatUserFriendlyError(result.error), "error");
        }
      }

      return result;
    },
    [cancelOrder, showToast, refreshData, formatUserFriendlyError]
  );

  // Cancel all open orders in a single PTB (atomic batch)
  const MAX_CANCEL_BATCH = 50;
  const handleCancelAllOrders = useCallback(
    async (orderIds: string[]): Promise<TradeResult> => {
      if (orderIds.length === 0) return { success: true };

      const cappedIds = orderIds.slice(0, MAX_CANCEL_BATCH);
      const result = await cancelAllOrders(cappedIds);

      if (result.success) {
        showToast(`Cancelled ${cappedIds.length} order${cappedIds.length > 1 ? 's' : ''}`, "success");
        refreshData();
      } else {
        const parsed = parseError(result.error);
        if (parsed.errorType === 'ORDER_NOT_FOUND') {
          showToast("Some orders were already filled or cancelled", "warning");
          refreshData();
          return { success: true };
        }
        showToast(`Failed to cancel orders: ${formatUserFriendlyError(result.error)}`, "error");
      }

      return result;
    },
    [cancelAllOrders, showToast, refreshData, formatUserFriendlyError]
  );

  // Unified onboarding: Enable Pado (BalanceManager + MarginAccount)
  const handleCreateBalanceManager = useCallback(async (): Promise<TradeResult> => {
    setIsEnabling(true);
    try {
      // Step 1: Create BalanceManager
      const result = await createBalanceManager();

      if (!result.success) {
        const friendlyError = formatUserFriendlyError(result.error);
        showToast(friendlyError, "error");
        return result;
      }

      // Step 2: Create MarginAccount if not exists (unified onboarding)
      if (!hasMarginAccount) {
        try {
          // Wait for RPC to sync after BalanceManager creation
          await new Promise((resolve) => setTimeout(resolve, RPC_SYNC_DELAY_MS));
          await createMarginAccount();
          showToast("Pado enabled!", "success");
        } catch (error) {
          // BM succeeded but MA failed - show warning but don't fail
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          console.warn("[UnifiedOnboarding] MarginAccount creation failed:", errorMsg);
          showToast("Trading enabled. Pado Balance setup failed.", "warning");
        }
      } else {
        showToast("Pado enabled!", "success");
      }

      // Refresh balance queries so the order form picks up wallet balances immediately
      refreshData();

      return result;
    } finally {
      setIsEnabling(false);
    }
  }, [createBalanceManager, hasMarginAccount, createMarginAccount, showToast, refreshData]);

  // Trading 잔고로 추가
  const handleDeposit = useCallback(async (): Promise<TradeResult> => {
    const result = await depositAllTokens();

    if (result.success) {
      const info = result.depositInfo;
      const message = info
        ? `Added ${info.baseAmount} ${info.baseSymbol} + ${info.quoteAmount} ${info.quoteSymbol} to trading`
        : "Funds added to trading balance!";
      showToast(message, "success");
      refreshData();
    } else {
      showToast(formatUserFriendlyError(result.error), "error");
    }

    return result;
  }, [depositAllTokens, showToast, refreshData, formatUserFriendlyError]);

  // 지갑으로 반환
  const handleWithdraw = useCallback(async (): Promise<TradeResult> => {
    const result = await withdrawAllTokens();

    if (result.success) {
      showToast("Funds returned to wallet!", "success");
      refreshData();
    } else {
      showToast(formatUserFriendlyError(result.error), "error");
    }

    return result;
  }, [withdrawAllTokens, showToast, refreshData, formatUserFriendlyError]);

  // Per-token deposit
  const handleDepositToken = useCallback(async (
    amount: number,
    coinType: string,
    decimals: number,
    symbol: string,
  ): Promise<TradeResult> => {
    const result = await depositToken(amount, coinType, decimals);

    if (result.success) {
      const formatted = decimals > 6 ? amount.toFixed(4) : amount.toFixed(2);
      showToast(`Deposited ${formatted} ${symbol} to trading`, "success");
      refreshData();
    } else {
      showToast(formatUserFriendlyError(result.error), "error");
    }

    return result;
  }, [depositToken, showToast, refreshData, formatUserFriendlyError]);

  // Per-token withdraw
  const handleWithdrawToken = useCallback(async (
    amount: number,
    coinType: string,
    decimals: number,
    symbol: string,
  ): Promise<TradeResult> => {
    const result = await withdrawToken(amount, coinType, decimals);

    if (result.success) {
      const formatted = decimals > 6 ? amount.toFixed(4) : amount.toFixed(2);
      showToast(`Withdrew ${formatted} ${symbol} to wallet`, "success");
      refreshData();
    } else {
      showToast(formatUserFriendlyError(result.error), "error");
    }

    return result;
  }, [withdrawToken, showToast, refreshData, formatUserFriendlyError]);

  return {
    isLoading: isLoading || isEnabling,
    isValidatingBalanceManager,
    balanceManagerId,
    isAutoDepositing,
    lastAutoDepositError,
    handleLimitOrder,
    handleMarketOrder,
    handleCancelOrder,
    handleCancelAllOrders,
    handleCreateBalanceManager,
    handleDeposit,
    handleWithdraw,
    handleDepositToken,
    handleWithdrawToken,
    refreshData,
  };
}
