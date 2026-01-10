/**
 * Unified Margin v1
 *
 * Frontend integration layer for unified balance management.
 * Combines wallet + BalanceManager + MarginAccount balances for seamless UX.
 *
 * @version 1.0.0 (Phase 16.5)
 */

// Core hooks
export { useUnifiedMargin, type UnifiedMarginState } from './useUnifiedMargin';
export { useMarginAccount } from './useMarginAccount';
export { useRiskEngine, type UseRiskEngineResult } from './useRiskEngine';

// Phase 16.1: Unified Balance (cash-only assets)
export {
  useUnifiedBalance,
  formatTokenBreakdown,
  type UnifiedBalanceState,
  type TokenBreakdown,
} from './useUnifiedBalance';

// Phase 16.5: Smart Account (multi-collateral + risk metrics)
export {
  useSmartAccount,
  formatCollateral,
  formatUsd,
  getRiskLevelLabel,
  getRiskLevelColor,
  type SmartAccountState,
  type CollateralInfo,
  type AuthType,
} from './useSmartAccount';

// UI Components
export { MarginAccountCard } from './MarginAccountCard';
export { UnifiedBalanceCard } from './UnifiedBalanceCard';
export { SmartAccountPanel } from './SmartAccountPanel';
