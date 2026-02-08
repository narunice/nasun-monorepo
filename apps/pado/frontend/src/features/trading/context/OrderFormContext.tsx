/**
 * OrderFormContext
 * 주문 폼 상태를 Context로 공유 (오더북 클릭 → 폼 연동)
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { ORDER_TYPE } from '../constants';
import type { OrderType } from '../types';

// Execution Option 타입 (UI용)
export type ExecutionOption = 'GTC' | 'IOC' | 'FOK' | 'POST_ONLY';

// ExecutionOption -> DeepBook OrderType 매핑
export const EXECUTION_OPTION_MAP: Record<ExecutionOption, OrderType> = {
  GTC: ORDER_TYPE.NO_RESTRICTION,
  IOC: ORDER_TYPE.IMMEDIATE_OR_CANCEL,
  FOK: ORDER_TYPE.FILL_OR_KILL,
  POST_ONLY: ORDER_TYPE.POST_ONLY,
};

export type OrderModeType = 'limit' | 'market';

export interface OrderFormContextType {
  // 주문 입력 상태
  price: string;
  amount: string;
  setPrice: (price: string) => void;
  setAmount: (amount: string) => void;

  // Buy/Sell side
  side: 'buy' | 'sell';
  setSide: (side: 'buy' | 'sell') => void;

  // Order mode (Limit / Market)
  orderMode: OrderModeType;
  setOrderMode: (mode: OrderModeType) => void;

  // 실행 옵션 (Limit)
  executionOption: ExecutionOption;
  setExecutionOption: (option: ExecutionOption) => void;
  getOrderType: () => OrderType;

  // 슬리피지 (Market)
  slippage: number;
  setSlippage: (value: number) => void;

  // One-Click Trading
  oneClickEnabled: boolean;
  setOneClickEnabled: (enabled: boolean) => void;

  // Auto Deposit
  autoDepositEnabled: boolean;
  setAutoDepositEnabled: (enabled: boolean) => void;

  // TP/SL (Take Profit / Stop Loss)
  tpslEnabled: boolean;
  setTpslEnabled: (enabled: boolean) => void;
  tpPrice: string;
  setTpPrice: (value: string) => void;
  slPrice: string;
  setSlPrice: (value: string) => void;

  // 확인 모달 상태
  isConfirmModalOpen: boolean;
  pendingOrderType: 'buy' | 'sell';
  openConfirmModal: (type: 'buy' | 'sell') => void;
  closeConfirmModal: () => void;

  // 유틸리티
  resetForm: () => void;
}

const OrderFormContext = createContext<OrderFormContextType | null>(null);

export function OrderFormProvider({ children }: { children: ReactNode }) {
  // 주문 입력 상태
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');

  // Buy/Sell side
  const [side, setSide] = useState<'buy' | 'sell'>('buy');

  // Order mode (Limit / Market)
  const [orderMode, setOrderMode] = useState<OrderModeType>('limit');

  // 실행 옵션 상태 (Limit)
  const [executionOption, setExecutionOption] = useState<ExecutionOption>('GTC');

  // 슬리피지 상태 (Market) - 기본값 0.5%
  const [slippage, setSlippage] = useState(0.5);

  // One-Click Trading 상태 (localStorage 저장)
  const [oneClickEnabled, setOneClickEnabled] = useState(() => {
    try {
      return localStorage.getItem('pado:oneClickEnabled') === 'true';
    } catch {
      return false;
    }
  });

  const handleSetOneClickEnabled = useCallback((enabled: boolean) => {
    setOneClickEnabled(enabled);
    try {
      localStorage.setItem('pado:oneClickEnabled', String(enabled));
    } catch { /* ignore */ }
  }, []);

  // Auto Deposit 상태 (localStorage 저장, default enabled)
  const [autoDepositEnabled, setAutoDepositEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('pado:autoDepositEnabled');
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const handleSetAutoDepositEnabled = useCallback((enabled: boolean) => {
    setAutoDepositEnabled(enabled);
    try {
      localStorage.setItem('pado:autoDepositEnabled', String(enabled));
    } catch { /* ignore */ }
  }, []);

  // TP/SL state
  const [tpslEnabled, setTpslEnabled] = useState(false);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');

  // OrderType 변환
  const getOrderType = useCallback((): OrderType => {
    return EXECUTION_OPTION_MAP[executionOption];
  }, [executionOption]);

  // 확인 모달 상태
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingOrderType, setPendingOrderType] = useState<'buy' | 'sell'>('buy');

  // 확인 모달 열기
  const openConfirmModal = useCallback((type: 'buy' | 'sell') => {
    if (!price || !amount) return;
    setPendingOrderType(type);
    setIsConfirmModalOpen(true);
  }, [price, amount]);

  // 확인 모달 닫기
  const closeConfirmModal = useCallback(() => {
    setIsConfirmModalOpen(false);
  }, []);

  // 폼 초기화
  const resetForm = useCallback(() => {
    setPrice('');
    setAmount('');
    setTpPrice('');
    setSlPrice('');
  }, []);

  return (
    <OrderFormContext.Provider
      value={{
        price,
        amount,
        setPrice,
        setAmount,
        side,
        setSide,
        orderMode,
        setOrderMode,
        executionOption,
        setExecutionOption,
        getOrderType,
        slippage,
        setSlippage,
        oneClickEnabled,
        setOneClickEnabled: handleSetOneClickEnabled,
        autoDepositEnabled,
        setAutoDepositEnabled: handleSetAutoDepositEnabled,
        tpslEnabled,
        setTpslEnabled,
        tpPrice,
        setTpPrice,
        slPrice,
        setSlPrice,
        isConfirmModalOpen,
        pendingOrderType,
        openConfirmModal,
        closeConfirmModal,
        resetForm,
      }}
    >
      {children}
    </OrderFormContext.Provider>
  );
}

export function useOrderForm(): OrderFormContextType {
  const context = useContext(OrderFormContext);
  if (!context) {
    throw new Error('useOrderForm must be used within OrderFormProvider');
  }
  return context;
}
