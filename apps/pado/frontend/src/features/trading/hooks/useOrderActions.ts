/**
 * useOrderActions Hook
 * 주문 실행 래퍼 (useTrading + Toast 통합)
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTrading } from '../useTrading';
import { useMarket } from '../context/MarketContext';
import type { TradeResult, OrderType } from '../types';
import { ORDER_TYPE } from '../constants';
import { useToast } from '../../../components/common';
import { quantityToRaw, getMinQuantity, getMinPrice } from '../../../lib/deepbook';
import { isMarginError } from '../../../lib/risk-engine';

export interface UseOrderActionsResult {
  isLoading: boolean;
  balanceManagerId: string | null;

  // 주문 실행
  handleLimitOrder: (
    type: 'buy' | 'sell',
    price: number,
    amount: number,
    orderType?: OrderType,
  ) => Promise<TradeResult>;
  handleMarketOrder: (type: 'buy' | 'sell', amount: number) => Promise<TradeResult>;
  handleCancelOrder: (orderId: string) => Promise<TradeResult>;

  // BalanceManager 관리
  handleCreateBalanceManager: () => Promise<TradeResult>;
  handleDeposit: () => Promise<TradeResult>;
  handleWithdraw: () => Promise<TradeResult>;
}

/**
 * 체결 결과 메시지 포맷팅
 */
function formatOrderResult(result: TradeResult, isBid: boolean): string {
  const action = isBid ? 'Buy' : 'Sell';
  const exec = result.executionInfo;

  if (!exec) {
    return `${action} order placed! Tx: ${result.digest?.slice(0, 16)}...`;
  }

  if (exec.status === 'filled') {
    return `${action} FILLED! ${exec.executedQuantity.toFixed(4)} NBTC @ $${exec.avgPrice.toFixed(2)}`;
  } else if (exec.status === 'partial') {
    const total = exec.executedQuantity + exec.remainingQuantity;
    return `${action} PARTIAL: ${exec.executedQuantity.toFixed(4)}/${total.toFixed(4)} NBTC`;
  }

  return `${action} order placed! Tx: ${result.digest?.slice(0, 16)}...`;
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
  } = useTrading();

  // 에러 메시지를 사용자 친화적으로 변환
  const formatUserFriendlyError = useCallback(
    (error: string | undefined): string => {
      if (!error) return 'Unknown error';

      const minQty = getMinQuantity(currentPool);
      const minPrice = getMinPrice(currentPool);
      const baseSymbol = currentPool.baseToken.symbol;

      // 수량 관련 에러
      if (error.includes('ORDER_INFO-2') || error.includes('lot size')) {
        return `수량은 ${minQty} ${baseSymbol}의 배수여야 합니다 (예: ${minQty}, ${minQty * 10}, ${minQty * 100})`;
      }

      // 가격 관련 에러
      if (error.includes('POOL-2') || error.includes('tick size')) {
        return `가격은 $${minPrice}의 배수여야 합니다`;
      }

      // 잔고 부족
      if (error.includes('BM-3') || error.includes('Insufficient balance')) {
        return 'Insufficient balance. Add funds to trading balance and try again.';
      }

      // Margin 부족 (Pado Balance)
      if (isMarginError(error)) {
        return 'Insufficient margin in Pado Balance. Deposit more NUSDC or reduce trade size.';
      }

      // Post-only 에러
      if (error.includes('POOL-6') || error.includes('cross the book')) {
        return 'Post-only 주문이 즉시 체결됩니다. 가격을 조정해주세요.';
      }

      return error;
    },
    [currentPool],
  );

  // 데이터 갱신 헬퍼
  const refreshData = useCallback(() => {
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['openOrders'] });
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
    }, 2000);
  }, [queryClient]);

  // 지정가 주문 실행
  const handleLimitOrder = useCallback(
    async (
      type: 'buy' | 'sell',
      price: number,
      amount: number,
      orderType: OrderType = ORDER_TYPE.NO_RESTRICTION,
    ): Promise<TradeResult> => {
      const result =
        type === 'buy'
          ? await placeBuyOrder(price, amount, orderType)
          : await placeSellOrder(price, amount, orderType);

      if (result.success) {
        const message = formatOrderResult(result, type === 'buy');
        showToast(message, 'success');
        refreshData();
      } else {
        const friendlyError = formatUserFriendlyError(result.error);
        showToast(friendlyError, 'error');
      }

      return result;
    },
    [placeBuyOrder, placeSellOrder, showToast, refreshData, formatUserFriendlyError],
  );

  // 시장가 주문 실행
  const handleMarketOrder = useCallback(
    async (type: 'buy' | 'sell', amount: number): Promise<TradeResult> => {
      const rawQuantity = quantityToRaw(amount);
      const result = await placeMarketOrder({
        quantity: rawQuantity,
        isBid: type === 'buy',
      });

      if (result.success) {
        showToast(`Market ${type} executed!`, 'success');
        refreshData();
      } else {
        const friendlyError = formatUserFriendlyError(result.error);
        showToast(friendlyError, 'error');
      }

      return result;
    },
    [placeMarketOrder, showToast, refreshData, formatUserFriendlyError],
  );

  // 주문 취소
  const handleCancelOrder = useCallback(
    async (orderId: string): Promise<TradeResult> => {
      const result = await cancelOrder(orderId);

      if (result.success) {
        showToast('Order cancelled successfully', 'success');
        refreshData();
      } else {
        // 이미 체결된 주문인 경우 경고
        if (
          result.error?.includes('leaf_remove') ||
          result.error?.includes('big_vector')
        ) {
          showToast('Order already filled or cancelled', 'warning');
        } else {
          showToast(`Cancel error: ${result.error}`, 'error');
        }
      }

      return result;
    },
    [cancelOrder, showToast, refreshData],
  );

  // Trading 활성화 (BalanceManager 생성)
  const handleCreateBalanceManager = useCallback(async (): Promise<TradeResult> => {
    const result = await createBalanceManager();

    if (result.success) {
      showToast('Trading enabled!', 'success');
    } else {
      showToast(`Error: ${result.error}`, 'error');
    }

    return result;
  }, [createBalanceManager, showToast]);

  // Trading 잔고로 추가
  const handleDeposit = useCallback(async (): Promise<TradeResult> => {
    const result = await depositAllTokens();

    if (result.success) {
      const info = result.depositInfo;
      const message = info
        ? `Added ${info.baseAmount} ${info.baseSymbol} + ${info.quoteAmount} ${info.quoteSymbol} to trading`
        : 'Funds added to trading balance!';
      showToast(message, 'success');
      refreshData();
    } else {
      showToast(`Error: ${result.error}`, 'error');
    }

    return result;
  }, [depositAllTokens, showToast, refreshData]);

  // 지갑으로 반환
  const handleWithdraw = useCallback(async (): Promise<TradeResult> => {
    const result = await withdrawAllTokens();

    if (result.success) {
      showToast('Funds returned to wallet!', 'success');
      refreshData();
    } else {
      showToast(`Error: ${result.error}`, 'error');
    }

    return result;
  }, [withdrawAllTokens, showToast, refreshData]);

  return {
    isLoading,
    balanceManagerId,
    handleLimitOrder,
    handleMarketOrder,
    handleCancelOrder,
    handleCreateBalanceManager,
    handleDeposit,
    handleWithdraw,
  };
}
