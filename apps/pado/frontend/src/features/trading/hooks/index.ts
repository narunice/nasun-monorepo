/**
 * Trading Hooks
 */

export { useOrderbook, type OrderbookData } from './useOrderbook';
export { useOpenOrders, type OpenOrdersData } from './useOpenOrders';
export { useFaucet, type UseFaucetResult } from './useFaucet';
export { useOrderActions, type UseOrderActionsResult } from './useOrderActions';
export { useTradeEvents } from './useTradeEvents';
export { useOrderHistory, type OrderHistoryItem, type OrderType, type OrderStatus } from './useOrderHistory';
export { useMyTrades, type MyTradeItem } from './useMyTrades';
export { useSenderEvents } from './useSenderEvents';
export { useTradeMode, type TradeMode } from './useTradeMode';
export { useBalanceManagerBalance } from './useBalanceManagerBalance';
export {
  useKeyboardShortcuts,
  SHORTCUT_PERCENT_EVENT,
  SHORTCUT_PRICE_STEP_EVENT,
  SHORTCUT_SUBMIT_EVENT,
  SHORTCUT_TOGGLE_BOOK_TAB_EVENT,
} from './useKeyboardShortcuts';
export { useTransactionExecutor } from './useTransactionExecutor';
export {
  useAutoDeposit,
  type AutoDepositResult,
  type AutoDepositCheckResult,
  type UseAutoDepositResult,
} from './useAutoDeposit';
export { useTradeCap, type UseTradeCapResult, type TradeCapStatus } from './useTradeCap';
export { useOnboardingTour, isTourCompleted, type OnboardingTourState } from './useOnboardingTour';
export {
  useOrderFillNotifier,
  ORDER_FILL_EVENT,
  type OrderFillDetail,
} from './useOrderFillNotifier';
export { useFirstTradeCelebration, FIRST_TRADE_STORAGE_KEY } from './useFirstTradeCelebration';
