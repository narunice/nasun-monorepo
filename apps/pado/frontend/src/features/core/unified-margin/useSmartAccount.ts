/**
 * useSmartAccount
 *
 * Unified account hook combining:
 * - Authentication (embedded wallet / zkLogin)
 * - Multi-collateral balances (NUSDC, NBTC with haircuts)
 * - Risk metrics (margin ratio, free collateral)
 * - Deposit/Withdraw actions
 *
 * This is the primary hook for Phase 16.5 Smart Account UI.
 *
 * @version 1.0.0 (Phase 16.5)
 */

import { useMemo, useCallback } from 'react';
import { useWallet, useZkLogin, useMultiBalance } from '@nasun/wallet';
import { useMarginAccount } from './useMarginAccount';
import { useUnifiedBalance } from './useUnifiedBalance';
import { usePrices } from '../usePrices';
import { TOKENS } from '../../../config/network';
import type { TokenSymbol } from '../../../lib/prices';

// ===== Types =====

export type AuthType = 'embedded' | 'zkLogin' | 'none';

export interface CollateralInfo {
  /** Raw balance in smallest unit */
  balance: bigint;
  /** Balance in human-readable format */
  amount: number;
  /** USD value (with haircut applied) */
  value: number;
  /** USD value (without haircut) */
  rawValue: number;
  /** Haircut percentage (e.g., 5 means 5%) */
  haircut: number;
}

export interface SmartAccountState {
  // === Authentication ===
  /** Connected wallet address */
  address: string | null;
  /** Auth type */
  authType: AuthType;
  /** Whether connected */
  isConnected: boolean;

  // === Unified Balance ===
  /** Total equity (collateral value + unrealized PnL) */
  totalEquity: number;
  /** Free collateral (available for new positions) */
  freeCollateral: number;
  /** Margin used by positions */
  marginUsed: number;
  /** Margin ratio in percentage (0-100+) */
  marginRatio: number;

  // === Risk Status ===
  /** Risk level: 0=Healthy, 1=Warning, 2=Liquidatable, 3=Critical */
  riskLevel: number;
  /** Whether account is in healthy state */
  isHealthy: boolean;
  /** Whether account is liquidatable */
  isLiquidatable: boolean;

  // === Collateral Breakdown ===
  collateral: {
    NUSDC: CollateralInfo;
    NBTC: CollateralInfo;
    NASUN: CollateralInfo;
  };
  /** Total collateral value (after haircuts) */
  totalCollateralValue: number;

  // === Account Status ===
  /** Whether Pado is enabled (has MarginAccount) */
  isPadoEnabled: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;

  // === Actions ===
  /** Refresh all data */
  refetch: () => void;
}

// === Haircut Configuration ===
// These should match the on-chain values in MarginRegistry
const HAIRCUTS: Record<string, number> = {
  NUSDC: 0,    // 100% value
  NBTC: 5,     // 95% value
  NASUN: 10,   // 90% value (future support)
};

// === Risk Thresholds (basis points) ===
const INITIAL_MARGIN_BPS = 1000;      // 10%
const WARNING_THRESHOLD_BPS = 800;    // 8%
const MAINTENANCE_MARGIN_BPS = 500;   // 5%

/**
 * Smart Account hook - unified account management
 *
 * @example
 * const {
 *   address,
 *   totalEquity,
 *   freeCollateral,
 *   marginRatio,
 *   isHealthy,
 *   collateral,
 * } = useSmartAccount();
 */
export function useSmartAccount(): SmartAccountState {
  // === Authentication ===
  const { status, account: walletAccount } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();

  const isConnected = (status === 'unlocked' && !!walletAccount) || isZkLoggedIn;
  const address = isZkLoggedIn
    ? zkState?.address ?? null
    : status === 'unlocked'
      ? walletAccount?.address ?? null
      : null;
  const authType: AuthType = isZkLoggedIn ? 'zkLogin' : status === 'unlocked' ? 'embedded' : 'none';

  // === Data Sources ===
  const { data: walletBalance, isLoading: isWalletLoading } = useMultiBalance();
  const {
    account: marginAccount,
    hasAccount: hasMarginAccount,
    isLoading: isMarginLoading,
    error: marginError,
    refetch: refetchMargin,
  } = useMarginAccount();
  const { getPrice, isLoading: isPriceLoading } = usePrices();
  const { refetch: refetchBalance } = useUnifiedBalance();

  // === Calculate Values ===
  const result = useMemo(() => {
    // Default empty state
    const emptyState = {
      totalEquity: 0,
      freeCollateral: 0,
      marginUsed: 0,
      marginRatio: 100,
      riskLevel: 0,
      isHealthy: true,
      isLiquidatable: false,
      collateral: {
        NUSDC: { balance: 0n, amount: 0, value: 0, rawValue: 0, haircut: HAIRCUTS.NUSDC },
        NBTC: { balance: 0n, amount: 0, value: 0, rawValue: 0, haircut: HAIRCUTS.NBTC },
        NASUN: { balance: 0n, amount: 0, value: 0, rawValue: 0, haircut: HAIRCUTS.NASUN },
      },
      totalCollateralValue: 0,
    };

    if (!isConnected || !hasMarginAccount) {
      return emptyState;
    }

    // Get prices
    const nbtcPrice = getPrice('NBTC');
    const nasunPrice = getPrice('NASUN');
    // NUSDC is always $1

    // === Parse Margin Account Balances ===
    const nusdcBalance = marginAccount?.nusdcBalance ?? 0n;
    const nbtcBalance = marginAccount?.nbtcBalance ?? 0n;

    // === Parse Wallet Balances (for NASUN - future use) ===
    const nasunBalance = walletBalance?.native?.balance ?? 0n;

    // === Calculate Collateral Values ===
    const nusdcAmount = Number(nusdcBalance) / 10 ** TOKENS.NUSDC.decimals;
    const nbtcAmount = Number(nbtcBalance) / 10 ** TOKENS.NBTC.decimals;
    const nasunAmount = Number(nasunBalance) / 10 ** TOKENS.NASUN.decimals;

    // Raw values (before haircut)
    const nusdcRawValue = nusdcAmount; // $1 per NUSDC
    const nbtcRawValue = nbtcAmount * nbtcPrice;
    const nasunRawValue = nasunAmount * nasunPrice;

    // Apply haircuts
    const nusdcValue = nusdcRawValue * (1 - HAIRCUTS.NUSDC / 100);
    const nbtcValue = nbtcRawValue * (1 - HAIRCUTS.NBTC / 100);
    const nasunValue = nasunRawValue * (1 - HAIRCUTS.NASUN / 100);

    // Total collateral (only NUSDC and NBTC for now, NASUN not yet in MarginAccount)
    const totalCollateralValue = nusdcValue + nbtcValue;

    // === Calculate Risk Metrics ===
    // For now, we don't have position tracking in frontend
    // So marginUsed = 0 and freeCollateral = totalCollateralValue
    const marginUsed = 0; // TODO: Get from AccountPositions
    const freeCollateral = totalCollateralValue - marginUsed;

    // Margin ratio = collateral / positions * 100
    // If no positions, margin ratio is max (100%)
    const positionValue = 0; // TODO: Get from AccountPositions
    const marginRatio = positionValue > 0
      ? (totalCollateralValue / positionValue) * 100
      : 100;

    // Risk level calculation
    const marginRatioBps = marginRatio * 100; // Convert to basis points
    let riskLevel = 0;
    if (marginRatioBps < MAINTENANCE_MARGIN_BPS) {
      riskLevel = 3; // Critical
    } else if (marginRatioBps < WARNING_THRESHOLD_BPS) {
      riskLevel = 2; // Liquidatable
    } else if (marginRatioBps < INITIAL_MARGIN_BPS) {
      riskLevel = 1; // Warning
    }

    const isHealthy = riskLevel === 0;
    const isLiquidatable = riskLevel >= 2;

    // Total equity = collateral + unrealized PnL
    // For now, no PnL tracking
    const totalEquity = totalCollateralValue;

    return {
      totalEquity,
      freeCollateral,
      marginUsed,
      marginRatio,
      riskLevel,
      isHealthy,
      isLiquidatable,
      collateral: {
        NUSDC: {
          balance: nusdcBalance,
          amount: nusdcAmount,
          value: nusdcValue,
          rawValue: nusdcRawValue,
          haircut: HAIRCUTS.NUSDC,
        },
        NBTC: {
          balance: nbtcBalance,
          amount: nbtcAmount,
          value: nbtcValue,
          rawValue: nbtcRawValue,
          haircut: HAIRCUTS.NBTC,
        },
        NASUN: {
          balance: nasunBalance,
          amount: nasunAmount,
          value: nasunValue,
          rawValue: nasunRawValue,
          haircut: HAIRCUTS.NASUN,
        },
      },
      totalCollateralValue,
    };
  }, [isConnected, hasMarginAccount, marginAccount, walletBalance, getPrice]);

  // === Refetch ===
  const refetch = useCallback(() => {
    refetchMargin();
    refetchBalance();
  }, [refetchMargin, refetchBalance]);

  // === Loading State ===
  const isLoading = isWalletLoading || isMarginLoading || isPriceLoading;

  return {
    // Auth
    address,
    authType,
    isConnected,

    // Balance
    ...result,

    // Account Status
    isPadoEnabled: hasMarginAccount,
    isLoading,
    error: marginError,

    // Actions
    refetch,
  };
}

/**
 * Format collateral value for display
 */
export function formatCollateral(value: number, symbol: TokenSymbol): string {
  if (symbol === 'NBTC') {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    });
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format USD value for display
 */
export function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Get risk level label
 */
export function getRiskLevelLabel(level: number): string {
  switch (level) {
    case 0: return 'Healthy';
    case 1: return 'Warning';
    case 2: return 'Liquidatable';
    case 3: return 'Critical';
    default: return 'Unknown';
  }
}

/**
 * Get risk level color class
 */
export function getRiskLevelColor(level: number): string {
  switch (level) {
    case 0: return 'text-green-500';
    case 1: return 'text-yellow-500';
    case 2: return 'text-orange-500';
    case 3: return 'text-red-500';
    default: return 'text-theme-text-muted';
  }
}
