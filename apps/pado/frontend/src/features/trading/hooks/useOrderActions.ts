/**
 * useOrderActions Hook
 * 주문 실행 래퍼 (useTrading + Toast 통합)
 */

import { useCallback } from 'react';
import { useQueryClient } from "@tanstack/react-query";
import { useTrading } from "../useTrading";
import { useMarket } from "../context/MarketContext";
import { useOrderForm } from "../context/OrderFormContext";
import { useAutoDeposit } from "./useAutoDeposit";
import { useMarginAccount } from "../../core/unified-margin/useMarginAccount";
import type { TradeResult, OrderType } from "../types";
import { ORDER_TYPE } from "../constants";
import { useToast } from "@/components/common";
import { quantityToRaw, getMinQuantity, getMinPrice } from "../../../lib/deepbook";
import { isMarginError } from "../../../lib/risk-engine";
import { parseError } from "../utils/errorParser";
import { RPC_SYNC_DELAY_MS } from "../../../lib/constants";

export interface UseOrderActionsResult {
  isLoading: boolean;
  balanceManagerId: string | null;

  // Auto deposit runtime state
  isAutoDepositing: boolean;
  lastAutoDepositError: string | null;

  // 주문 실행
  handleLimitOrder: (
    type: "buy" | "sell",
    price: number,
    amount: number,
    orderType?: OrderType
  ) => Promise<TradeResult>;
  handleMarketOrder: (type: "buy" | "sell", amount: number) => Promise<TradeResult>;
  handleCancelOrder: (orderId: string) => Promise<TradeResult>;

  // BalanceManager 관리
  handleCreateBalanceManager: () => Promise<TradeResult>;
  handleDeposit: () => Promise<TradeResult>;
  handleWithdraw: () => Promise<TradeResult>;

  // Per-token deposit/withdraw
  handleDepositToken: (amount: number, coinType: string, decimals: number, symbol: string) => Promise<TradeResult>;
  handleWithdrawToken: (amount: number, coinType: string, decimals: number, symbol: string) => Promise<TradeResult>;
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
      msg += ` — Fee: ~$${fee.toFixed(2)}`;
    }
    return msg;
  } else if (exec.status === "partial") {
    const totalQty = exec.executedQuantity + exec.remainingQuantity;
    return `${action} PARTIAL ${exec.executedQuantity.toFixed(4)}/${totalQty.toFixed(4)} @ $${priceStr}`;
  }

  return `${action} Limit placed — Tx: ${result.digest?.slice(0, 10)}...`;
}

export function useOrderActions(): UseOrderActionsResult {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { currentPool } = useMarket();
  const {
    isLoading,
    balanceManagerId,
    placeBuyOrder,
    placeSellOrder,
    placeMarketOrder,
    cancelOrder,
    createBalanceManager,
    depositAllTokens,
    withdrawAllTokens,
    depositToken,
    withdrawToken,
  } = useTrading();

  // Auto deposit setting from context
  const { autoDepositEnabled } = useOrderForm();

  // Auto deposit hook
  const {
    depositIfNeeded,
    isDepositing: isAutoDepositing,
    lastDepositError: lastAutoDepositError,
  } = useAutoDeposit(balanceManagerId);

  // Margin account for unified onboarding
  const { hasAccount: hasMarginAccount, createAccount: createMarginAccount } = useMarginAccount();

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
        return "Not enough NASUN for gas. Get NASUN from Faucet in your wallet.";
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
      queryClient.invalidateQueries({ queryKey: ["orderbook"] });
    }, 2000);
  }, [queryClient]);

  // 지정가 주문 실행 (with auto deposit)
  const handleLimitOrder = useCallback(
    async (
      type: "buy" | "sell",
      price: number,
      amount: number,
      orderType: OrderType = ORDER_TYPE.NO_RESTRICTION
    ): Promise<TradeResult> => {
      // Auto deposit if enabled
      if (autoDepositEnabled && balanceManagerId) {
        // Calculate required amounts
        const requiredQuote = type === "buy" ? price * amount : 0;
        const requiredBase = type === "sell" ? amount : 0;

        const depositResult = await depositIfNeeded(requiredQuote, requiredBase);

        if (!depositResult.success) {
          const friendlyError = depositResult.error || "Auto deposit failed";
          showToast(friendlyError, "error");
          return {
            success: false,
            error: friendlyError,
          };
        }

        // Show deposit notification if deposit occurred
        const hasQuoteDeposit =
          depositResult.depositedQuoteAmount && depositResult.depositedQuoteAmount > 0;
        const hasBaseDeposit =
          depositResult.depositedBaseAmount && depositResult.depositedBaseAmount > 0;

        if (hasQuoteDeposit) {
          showToast(
            `Auto-deposited ${depositResult.depositedQuoteAmount!.toFixed(2)} NUSDC to trading`,
            "info"
          );
        }
        if (hasBaseDeposit) {
          showToast(
            `Auto-deposited ${depositResult.depositedBaseAmount!.toFixed(4)} NBTC to trading`,
            "info"
          );
        }

        if (hasQuoteDeposit || hasBaseDeposit) {
          // Wait for RPC to sync new object versions after deposit
          await new Promise((resolve) => setTimeout(resolve, RPC_SYNC_DELAY_MS));
        }
      }

      // Place the order
      const result =
        type === "buy"
          ? await placeBuyOrder(price, amount, orderType)
          : await placeSellOrder(price, amount, orderType);

      if (result.success) {
        const message = formatOrderResult(result, type === "buy", currentPool.takerFeeBps);
        showToast(message, "success");
        refreshData();
      } else {
        const requiredQuote = type === "buy" ? price * amount : 0;
        const requiredBase = type === "sell" ? amount : 0;
        const friendlyError = formatUserFriendlyError(result.error, {
          side: type,
          requiredAmount: type === "buy" ? requiredQuote : requiredBase,
          availableAmount: 0, // Exact available is unknown at this point
        });
        showToast(friendlyError, "error");
      }

      return result;
    },
    [
      autoDepositEnabled,
      balanceManagerId,
      depositIfNeeded,
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
      // Auto deposit if enabled
      // For market orders, estimate required quote based on orderbook (conservative estimate)
      if (autoDepositEnabled && balanceManagerId) {
        // Conservative estimate: use a high price for buy orders
        // Actual execution will use orderbook prices
        const estimatedPrice = 100000; // Conservative max price for NBTC
        const requiredQuote = type === "buy" ? estimatedPrice * amount : 0;
        const requiredBase = type === "sell" ? amount : 0;

        const depositResult = await depositIfNeeded(requiredQuote, requiredBase);

        if (!depositResult.success) {
          const friendlyError = depositResult.error || "Auto deposit failed";
          showToast(friendlyError, "error");
          return {
            success: false,
            error: friendlyError,
          };
        }

        const hasQuoteDeposit =
          depositResult.depositedQuoteAmount && depositResult.depositedQuoteAmount > 0;
        const hasBaseDeposit =
          depositResult.depositedBaseAmount && depositResult.depositedBaseAmount > 0;

        if (hasQuoteDeposit) {
          showToast(
            `Auto-deposited ${depositResult.depositedQuoteAmount!.toFixed(2)} NUSDC to trading`,
            "info"
          );
        }
        if (hasBaseDeposit) {
          showToast(
            `Auto-deposited ${depositResult.depositedBaseAmount!.toFixed(4)} NBTC to trading`,
            "info"
          );
        }

        if (hasQuoteDeposit || hasBaseDeposit) {
          // Wait for RPC to sync new object versions after deposit
          await new Promise((resolve) => setTimeout(resolve, RPC_SYNC_DELAY_MS));
        }
      }

      const rawQuantity = quantityToRaw(amount);
      const result = await placeMarketOrder({
        quantity: rawQuantity,
        isBid: type === "buy",
      });

      if (result.success) {
        const baseSymbol = currentPool.baseToken.symbol;
        const msg = result.executionInfo
          ? formatOrderResult(result, type === "buy", currentPool.takerFeeBps)
          : `Market ${type === "buy" ? "Buy" : "Sell"} ${amount.toFixed(4)} ${baseSymbol} executed!`;
        showToast(msg, "success");
        refreshData();
      } else {
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
        // 이미 체결된 주문인 경우 경고
        if (result.error?.includes("leaf_remove") || result.error?.includes("big_vector")) {
          showToast("Order already filled or cancelled", "warning");
        } else {
          showToast(`Cancel error: ${result.error}`, "error");
        }
      }

      return result;
    },
    [cancelOrder, showToast, refreshData]
  );

  // Unified onboarding: Enable Pado (BalanceManager + MarginAccount)
  const handleCreateBalanceManager = useCallback(async (): Promise<TradeResult> => {
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

    return result;
  }, [createBalanceManager, hasMarginAccount, createMarginAccount, showToast]);

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
      showToast(`Error: ${result.error}`, "error");
    }

    return result;
  }, [depositAllTokens, showToast, refreshData]);

  // 지갑으로 반환
  const handleWithdraw = useCallback(async (): Promise<TradeResult> => {
    const result = await withdrawAllTokens();

    if (result.success) {
      showToast("Funds returned to wallet!", "success");
      refreshData();
    } else {
      showToast(`Error: ${result.error}`, "error");
    }

    return result;
  }, [withdrawAllTokens, showToast, refreshData]);

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
    isLoading,
    balanceManagerId,
    isAutoDepositing,
    lastAutoDepositError,
    handleLimitOrder,
    handleMarketOrder,
    handleCancelOrder,
    handleCreateBalanceManager,
    handleDeposit,
    handleWithdraw,
    handleDepositToken,
    handleWithdrawToken,
  };
}
