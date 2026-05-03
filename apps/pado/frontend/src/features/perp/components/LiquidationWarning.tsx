/**
 * Liquidation Warning Component
 * Displays prominent warnings when positions are at risk
 */

import { usePerpMarketContext } from '../context/PerpMarketContext';
import { usePerpPositionsWithMetrics } from '../hooks/usePerpPositions';
import { RISK_LEVEL, MARGIN_THRESHOLDS } from '../constants';
import type { PositionWithMetrics } from '../types';

export function LiquidationWarning() {
  const { selectedMarketId, currentPrice } = usePerpMarketContext();

  // Create price map for metrics calculation
  const priceMap = new Map<string, number>();
  if (selectedMarketId && currentPrice > 0) {
    priceMap.set(selectedMarketId, currentPrice);
  }

  const { positions } = usePerpPositionsWithMetrics(priceMap);

  // Filter for at-risk positions
  const criticalPositions = positions.filter(
    (p) => p.riskLevel === RISK_LEVEL.CRITICAL
  );
  const dangerPositions = positions.filter(
    (p) => p.riskLevel === RISK_LEVEL.DANGER
  );
  const warningPositions = positions.filter(
    (p) => p.riskLevel === RISK_LEVEL.WARNING
  );

  // Show critical warning first
  if (criticalPositions.length > 0) {
    return (
      <div className="mb-4 p-4 bg-red-500/35 border border-red-500/60 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg
              className="w-6 h-6 text-red-400 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-red-400 font-bold text-lg">
              Liquidation Imminent!
            </h3>
            <p className="text-red-300 text-sm mt-1">
              {criticalPositions.length === 1
                ? 'Your position is below maintenance margin and may be liquidated at any moment.'
                : `${criticalPositions.length} positions are below maintenance margin and may be liquidated at any moment.`}
            </p>
            <div className="mt-3 space-y-2">
              {criticalPositions.map((position) => (
                <CriticalPositionInfo key={position.id} position={position} />
              ))}
            </div>
            <p className="text-red-300 text-xs mt-3">
              Add collateral immediately to avoid liquidation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show danger warning
  if (dangerPositions.length > 0) {
    return (
      <div className="mb-4 p-4 bg-orange-500/35 border border-orange-500/60 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg
              className="w-5 h-5 text-orange-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-orange-400 font-bold">High Liquidation Risk</h3>
            <p className="text-orange-300 text-sm mt-1">
              {dangerPositions.length === 1
                ? `Your position's margin ratio is ${(dangerPositions[0].marginRatio / 100).toFixed(2)}%. Maintenance margin is ${(MARGIN_THRESHOLDS.DANGER / 100).toFixed(1)}%.`
                : `${dangerPositions.length} positions are approaching maintenance margin.`}
            </p>
            <p className="text-orange-300 text-xs mt-2">
              Consider adding collateral or reducing position size.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show warning
  if (warningPositions.length > 0) {
    return (
      <div className="mb-4 p-3 bg-yellow-500/25 border border-yellow-500/50 rounded-lg">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-yellow-400 text-sm">
            {warningPositions.length === 1
              ? 'Position margin is below 10%. Monitor closely.'
              : `${warningPositions.length} positions have low margin. Monitor closely.`}
          </span>
        </div>
      </div>
    );
  }

  return null;
}

interface CriticalPositionInfoProps {
  position: PositionWithMetrics;
}

function CriticalPositionInfo({ position }: CriticalPositionInfoProps) {
  const size = Number(position.size) / 100_000_000;

  return (
    <div className="flex items-center justify-between text-sm p-2 bg-red-500/25 rounded">
      <div className="flex items-center gap-2">
        <span
          className={`px-1.5 py-0.5 text-xs font-bold rounded ${
            position.isLong
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {position.isLong ? 'LONG' : 'SHORT'}
        </span>
        <span className="text-red-300">
          {size.toFixed(4)} BTC @ {position.leverage}x
        </span>
      </div>
      <div className="text-right">
        <span className="text-red-300">
          Margin: {(position.marginRatio / 100).toFixed(2)}%
        </span>
        <span className="text-red-400 ml-2 font-bold">
          Liq: ${position.liquidationPrice.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

/**
 * Compact liquidation indicator for header or navbar
 */
export function LiquidationIndicator() {
  const { selectedMarketId, currentPrice } = usePerpMarketContext();

  const priceMap = new Map<string, number>();
  if (selectedMarketId && currentPrice > 0) {
    priceMap.set(selectedMarketId, currentPrice);
  }

  const { positions } = usePerpPositionsWithMetrics(priceMap);

  const criticalCount = positions.filter(
    (p) => p.riskLevel === RISK_LEVEL.CRITICAL
  ).length;
  const dangerCount = positions.filter(
    (p) => p.riskLevel === RISK_LEVEL.DANGER
  ).length;

  if (criticalCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-red-500 text-white rounded-full animate-pulse">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        {criticalCount}
      </span>
    );
  }

  if (dangerCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-orange-500 text-white rounded-full">
        {dangerCount}
      </span>
    );
  }

  return null;
}
