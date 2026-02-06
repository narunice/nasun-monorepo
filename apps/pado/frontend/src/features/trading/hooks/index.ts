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
export { useTradeMode, type TradeMode } from './useTradeMode';
export { useBalanceManagerBalance } from './useBalanceManagerBalance';
export { useTransactionExecutor } from './useTransactionExecutor';
export {
  useAutoDeposit,
  type AutoDepositResult,
  type AutoDepositCheckResult,
  type UseAutoDepositResult,
} from './useAutoDeposit';
