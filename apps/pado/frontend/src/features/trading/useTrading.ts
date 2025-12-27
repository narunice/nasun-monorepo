/**
 * Trading Hook
 * DeepBook V3 주문 실행
 */

import { useState, useCallback, useEffect } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '../../lib/sui-client';
import { useWallet } from '../../wallet';
import {
  buildPlaceLimitOrder,
  buildPlaceMarketOrder,
  buildCancelOrder,
  buildCreateBalanceManager,
  buildDeposit,
  buildRequestTokens,
  buildDepositAll,
  buildWithdrawAll,
} from './transactions';
import type { PlaceLimitOrderParams, PlaceMarketOrderParams, TradeResult, OrderExecutionInfo, OrderType } from './types';
import { priceToRaw, quantityToRaw } from '../../lib/deepbook';
import { NETWORK_CONFIG } from '../../config/network';
import { formatErrorMessage } from './utils/errorParser';
import { useMarket } from './context/MarketContext';

interface UseTrading {
  // 상태
  isLoading: boolean;
  error: string | null;
  balanceManagerId: string | null;

  // 액션
  createBalanceManager: () => Promise<TradeResult>;
  depositToBalanceManager: (coinId: string, coinType: string) => Promise<TradeResult>;
  placeLimitOrder: (params: PlaceLimitOrderParams) => Promise<TradeResult>;
  placeMarketOrder: (params: PlaceMarketOrderParams) => Promise<TradeResult>;
  cancelOrder: (orderId: string) => Promise<TradeResult>;

  // 간편 주문 (UI에서 사용)
  placeBuyOrder: (price: number, amount: number, orderType?: OrderType) => Promise<TradeResult>;
  placeSellOrder: (price: number, amount: number, orderType?: OrderType) => Promise<TradeResult>;

  // Token Faucet
  requestTokens: () => Promise<TradeResult>;

  // Deposit
  depositAllTokens: () => Promise<TradeResult>;

  // Withdraw
  withdrawAllTokens: () => Promise<TradeResult>;
}

// BalanceManager ID를 로컬 스토리지에 저장
const BALANCE_MANAGER_KEY = 'pado_balance_manager';

function getStoredBalanceManagerId(): string | null {
  try {
    return localStorage.getItem(BALANCE_MANAGER_KEY);
  } catch {
    return null;
  }
}

function storeBalanceManagerId(id: string): void {
  try {
    localStorage.setItem(BALANCE_MANAGER_KEY, id);
  } catch {
    console.error('Failed to store balance manager ID');
  }
}

function clearStoredBalanceManagerId(): void {
  try {
    localStorage.removeItem(BALANCE_MANAGER_KEY);
  } catch {
    console.error('Failed to clear balance manager ID');
  }
}

async function validateBalanceManagerExists(id: string): Promise<boolean> {
  try {
    const client = getSuiClient();
    const obj = await client.getObject({ id });
    return obj.data !== null && obj.error === undefined;
  } catch {
    return false;
  }
}

/**
 * 이벤트에서 체결 정보 파싱
 * @param events - 트랜잭션 이벤트
 * @param quantity - 주문 수량
 * @param isBid - 매수 여부
 * @param baseDecimals - Base 토큰 소수점
 * @param quoteDecimals - Quote 토큰 소수점
 */
function parseExecutionInfo(
  events: any[],
  quantity: number,
  isBid: boolean,
  baseDecimals: number = 8,
  quoteDecimals: number = 6
): OrderExecutionInfo | undefined {
  if (!events || events.length === 0) return undefined;

  const orderInfoType = `${NETWORK_CONFIG.deepbookPackage}::order_info::OrderInfo`;
  const orderFilledType = `${NETWORK_CONFIG.deepbookPackage}::order_info::OrderFilled`;

  // OrderInfo 이벤트에서 체결 정보 추출
  const orderInfoEvent = events.find((e: any) => e.type === orderInfoType);
  if (orderInfoEvent?.parsedJson) {
    const json = orderInfoEvent.parsedJson;
    const executedQty = Number(json.executed_quantity || 0) / Math.pow(10, baseDecimals);
    const originalQty = Number(json.original_quantity || 0) / Math.pow(10, baseDecimals);
    const remainingQty = originalQty - executedQty;
    const cumulativeQuote = Number(json.cumulative_quote_quantity || 0) / Math.pow(10, quoteDecimals);
    const avgPrice = executedQty > 0 ? cumulativeQuote / executedQty : 0;

    let status: 'filled' | 'partial' | 'placed' = 'placed';
    if (executedQty >= originalQty * 0.9999) {
      status = 'filled';
    } else if (executedQty > 0) {
      status = 'partial';
    }

    return {
      executedQuantity: executedQty,
      executedQuote: cumulativeQuote,
      remainingQuantity: remainingQty,
      avgPrice,
      isBid,
      status,
    };
  }

  // OrderFilled 이벤트에서 체결 정보 추출 (대안)
  const filledEvents = events.filter((e: any) => e.type === orderFilledType);
  if (filledEvents.length > 0) {
    let totalBase = 0;
    let totalQuote = 0;
    filledEvents.forEach((e: any) => {
      if (e.parsedJson) {
        totalBase += Number(e.parsedJson.base_quantity || 0);
        totalQuote += Number(e.parsedJson.quote_quantity || 0);
      }
    });

    const executedQty = totalBase / Math.pow(10, baseDecimals);
    const executedQuote = totalQuote / Math.pow(10, quoteDecimals);
    const remainingQty = quantity - executedQty;
    const avgPrice = executedQty > 0 ? executedQuote / executedQty : 0;

    let status: 'filled' | 'partial' | 'placed' = 'placed';
    if (executedQty >= quantity * 0.9999) {
      status = 'filled';
    } else if (executedQty > 0) {
      status = 'partial';
    }

    return {
      executedQuantity: executedQty,
      executedQuote,
      remainingQuantity: remainingQty,
      avgPrice,
      isBid,
      status,
    };
  }

  return undefined;
}

export function useTrading(): UseTrading {
  const { account, getKeypair } = useWallet();
  const { currentPool } = useMarket();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceManagerId, setBalanceManagerId] = useState<string | null>(
    getStoredBalanceManagerId()
  );

  // BalanceManager 유효성 검사 (초기화 시)
  useEffect(() => {
    const validateAndCleanup = async () => {
      const storedId = getStoredBalanceManagerId();
      if (storedId) {
        const exists = await validateBalanceManagerExists(storedId);
        if (!exists) {
          console.warn('Stored BalanceManager does not exist on chain, clearing...');
          clearStoredBalanceManagerId();
          setBalanceManagerId(null);
        }
      }
    };
    validateAndCleanup();
  }, []);

  /**
   * 트랜잭션 서명 및 실행
   */
  const executeTransaction = useCallback(async (tx: Transaction): Promise<TradeResult> => {
    const keypair = getKeypair();
    if (!keypair || !account) {
      return { success: false, error: 'Wallet not connected' };
    }

    const client = getSuiClient();

    try {
      setIsLoading(true);
      setError(null);

      // Set sender
      tx.setSender(account.address);

      // Build and sign
      const bytes = await tx.build({ client });
      const signature = await keypair.signTransaction(bytes);

      // Execute
      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature: signature.signature,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      if (result.effects?.status.status === 'success') {
        return {
          success: true,
          digest: result.digest,
          objectChanges: result.objectChanges ?? undefined,
          events: result.events ?? undefined,
        };
      } else {
        return {
          success: false,
          error: result.effects?.status.error || 'Transaction failed',
        };
      }
    } catch (err) {
      // 에러 메시지를 사용자 친화적으로 변환
      const message = formatErrorMessage(err);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [account, getKeypair]);

  /**
   * BalanceManager 생성
   */
  const createBalanceManager = useCallback(async (): Promise<TradeResult> => {
    const tx = buildCreateBalanceManager();
    const result = await executeTransaction(tx);

    if (result.success && result.objectChanges) {
      // Created 객체에서 BalanceManager 찾기
      const created = result.objectChanges.find(
        (change: any) => change.type === 'created' &&
          change.objectType?.includes('BalanceManager')
      );

      if (created && 'objectId' in created) {
        const managerId = created.objectId;
        setBalanceManagerId(managerId);
        storeBalanceManagerId(managerId);
        return { success: true, digest: result.digest };
      }
    }

    return result;
  }, [executeTransaction]);

  /**
   * BalanceManager에 토큰 입금
   */
  const depositToBalanceManager = useCallback(async (
    coinId: string,
    coinType: string,
  ): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created' };
    }

    const tx = buildDeposit(balanceManagerId, coinId, coinType);
    return executeTransaction(tx);
  }, [balanceManagerId, executeTransaction]);

  /**
   * 지정가 주문
   */
  const placeLimitOrder = useCallback(async (
    params: PlaceLimitOrderParams,
  ): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created. Create one first.' };
    }

    const tx = buildPlaceLimitOrder(balanceManagerId, params, currentPool);
    return executeTransaction(tx);
  }, [balanceManagerId, executeTransaction, currentPool]);

  /**
   * 시장가 주문
   */
  const placeMarketOrder = useCallback(async (
    params: PlaceMarketOrderParams,
  ): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created. Create one first.' };
    }

    const tx = buildPlaceMarketOrder(balanceManagerId, params, currentPool);
    return executeTransaction(tx);
  }, [balanceManagerId, executeTransaction, currentPool]);

  /**
   * 주문 취소
   */
  const cancelOrder = useCallback(async (orderId: string): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created' };
    }

    const tx = buildCancelOrder(balanceManagerId, orderId, currentPool);
    return executeTransaction(tx);
  }, [balanceManagerId, executeTransaction, currentPool]);

  /**
   * 간편 매수 주문 (UI용)
   */
  const placeBuyOrder = useCallback(async (
    price: number,
    amount: number,
    orderType?: OrderType,
  ): Promise<TradeResult> => {
    const rawPrice = priceToRaw(price, currentPool.quoteToken.decimals);
    const rawQuantity = quantityToRaw(amount, currentPool.baseToken.decimals);

    const result = await placeLimitOrder({
      price: rawPrice,
      quantity: rawQuantity,
      isBid: true,
      orderType,
    });

    // 체결 정보 파싱
    if (result.success && result.events) {
      const executionInfo = parseExecutionInfo(
        result.events,
        amount,
        true,
        currentPool.baseToken.decimals,
        currentPool.quoteToken.decimals
      );
      if (executionInfo) {
        return { ...result, executionInfo };
      }
    }

    return result;
  }, [placeLimitOrder, currentPool]);

  /**
   * 간편 매도 주문 (UI용)
   */
  const placeSellOrder = useCallback(async (
    price: number,
    amount: number,
    orderType?: OrderType,
  ): Promise<TradeResult> => {
    const rawPrice = priceToRaw(price, currentPool.quoteToken.decimals);
    const rawQuantity = quantityToRaw(amount, currentPool.baseToken.decimals);

    const result = await placeLimitOrder({
      price: rawPrice,
      quantity: rawQuantity,
      isBid: false,
      orderType,
    });

    // 체결 정보 파싱
    if (result.success && result.events) {
      const executionInfo = parseExecutionInfo(
        result.events,
        amount,
        false,
        currentPool.baseToken.decimals,
        currentPool.quoteToken.decimals
      );
      if (executionInfo) {
        return { ...result, executionInfo };
      }
    }

    return result;
  }, [placeLimitOrder, currentPool]);

  /**
   * 테스트 토큰 요청 (1 NBTC + 100,000 NUSDC)
   */
  const requestTokens = useCallback(async (): Promise<TradeResult> => {
    const tx = buildRequestTokens();
    return executeTransaction(tx);
  }, [executeTransaction]);

  /**
   * 현재 풀의 Base/Quote 토큰을 BalanceManager에 입금
   * NASUN (네이티브 토큰)의 경우 가스비를 위해 0.1 NASUN 남김
   */
  const depositAllTokens = useCallback(async (): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created. Create one first.' };
    }

    if (!account) {
      return { success: false, error: 'Wallet not connected' };
    }

    const { tx, baseAmount, quoteAmount } = await buildDepositAll(
      balanceManagerId,
      account.address,
      currentPool,
    );
    const result = await executeTransaction(tx);

    if (result.success) {
      const baseDecimals = currentPool.baseToken.decimals;
      const quoteDecimals = currentPool.quoteToken.decimals;
      const baseFormatDecimals = baseDecimals > 6 ? 4 : 2;
      const quoteFormatDecimals = quoteDecimals > 4 ? 2 : quoteDecimals;

      return {
        ...result,
        depositInfo: {
          baseAmount: (Number(baseAmount) / Math.pow(10, baseDecimals)).toFixed(baseFormatDecimals),
          quoteAmount: (Number(quoteAmount) / Math.pow(10, quoteDecimals)).toFixed(quoteFormatDecimals),
          baseSymbol: currentPool.baseToken.symbol,
          quoteSymbol: currentPool.quoteToken.symbol,
        },
      };
    }
    return result;
  }, [balanceManagerId, account, executeTransaction, currentPool]);

  /**
   * BalanceManager에서 현재 풀의 Base/Quote 토큰을 지갑으로 출금
   */
  const withdrawAllTokens = useCallback(async (): Promise<TradeResult> => {
    if (!balanceManagerId) {
      return { success: false, error: 'BalanceManager not created.' };
    }

    if (!account) {
      return { success: false, error: 'Wallet not connected' };
    }

    const tx = buildWithdrawAll(balanceManagerId, account.address, currentPool);
    return executeTransaction(tx);
  }, [balanceManagerId, account, executeTransaction, currentPool]);

  return {
    isLoading,
    error,
    balanceManagerId,
    createBalanceManager,
    depositToBalanceManager,
    placeLimitOrder,
    placeMarketOrder,
    cancelOrder,
    placeBuyOrder,
    placeSellOrder,
    requestTokens,
    depositAllTokens,
    withdrawAllTokens,
  };
}
