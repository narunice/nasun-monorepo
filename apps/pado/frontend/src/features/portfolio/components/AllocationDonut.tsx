/**
 * AllocationDonut Component
 * Pure SVG donut chart showing portfolio allocation by token.
 * No external dependencies — uses stroke-dasharray for segments.
 */

import { useMemo } from 'react';
import { useTotalValue, type TokenValue } from '../hooks/useTotalValue';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getTokenHexColor } from '@/components/common';

const KNOWN_TOKENS = ['NBTC', 'NUSDC', 'NSN', 'NETH', 'NSOL'];
const OTHER_COLOR = '#6b7280';

const CHART_SIZE = 160;
const STROKE_WIDTH = 28;
const RADIUS = (CHART_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MIN_PERCENT = 1; // Segments below this get grouped as "Other"

interface DonutSegment {
  symbol: string;
  color: string;
  percent: number;
  value: number;
}

function buildSegments(tokens: TokenValue[], totalValue: number): DonutSegment[] {
  if (totalValue <= 0) return [];

  const raw: DonutSegment[] = [];
  let otherValue = 0;

  for (const token of tokens) {
    // Skip synthetic entries like "Pado Balance" and "Predictions"
    if (!KNOWN_TOKENS.includes(token.symbol)) {
      otherValue += token.value;
      continue;
    }

    const percent = (token.value / totalValue) * 100;
    if (percent < MIN_PERCENT) {
      otherValue += token.value;
    } else {
      raw.push({
        symbol: token.symbol,
        color: getTokenHexColor(token.symbol),
        percent,
        value: token.value,
      });
    }
  }

  // Sort by value descending
  raw.sort((a, b) => b.value - a.value);

  // Add "Other" if needed
  if (otherValue > 0) {
    raw.push({
      symbol: 'Other',
      color: OTHER_COLOR,
      percent: (otherValue / totalValue) * 100,
      value: otherValue,
    });
  }

  return raw;
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export function AllocationDonut() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn || isPasskeyUnlocked;

  const { totalValue, tokens, isLoading } = useTotalValue();

  const segments = useMemo(
    () => buildSegments(tokens, totalValue),
    [tokens, totalValue]
  );

  // Empty states
  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <h2 className="font-bold text-theme-text-primary mb-3">Allocation</h2>
        <div className="flex items-center justify-center h-40 text-sm text-theme-text-muted">
          Connect wallet to view allocation
        </div>
      </div>
    );
  }

  if (!isLoading && (totalValue <= 0 || segments.length === 0)) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <h2 className="font-bold text-theme-text-primary mb-3">Allocation</h2>
        <div className="flex items-center justify-center h-40 text-sm text-theme-text-muted">
          No assets
        </div>
      </div>
    );
  }

  // Calculate stroke offsets for each segment
  const arcs = segments.reduce<Array<DonutSegment & { dashArray: string; dashOffset: number }>>((result, seg) => {
    const prevOffset = result.reduce((sum, a) => sum + (a.percent / 100) * CIRCUMFERENCE, 0);
    const dashLength = (seg.percent / 100) * CIRCUMFERENCE;
    const gap = CIRCUMFERENCE - dashLength;
    result.push({ ...seg, dashArray: `${dashLength} ${gap}`, dashOffset: -prevOffset });
    return result;
  }, []);

  const cx = CHART_SIZE / 2;
  const cy = CHART_SIZE / 2;

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <h2 className="font-bold text-theme-text-primary mb-3">Allocation</h2>

      <div className="flex items-center gap-4">
        {/* Donut Chart */}
        <div className="shrink-0 relative" style={{ width: CHART_SIZE, height: CHART_SIZE }}>
          <svg width={CHART_SIZE} height={CHART_SIZE} viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}>
            {/* Background ring */}
            <circle
              cx={cx}
              cy={cy}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              className="text-theme-bg-tertiary"
            />
            {/* Segment arcs */}
            {arcs.map((arc) => (
              <circle
                key={arc.symbol}
                cx={cx}
                cy={cy}
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.dashOffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ))}
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-theme-text-muted">Total</span>
            <span className="text-sm font-bold text-theme-text-primary">
              {isLoading ? '...' : formatValue(totalValue)}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-2">
          {arcs.map((seg) => (
            <div key={seg.symbol} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-xs text-theme-text-primary truncate">{seg.symbol}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-theme-text-secondary">{formatValue(seg.value)}</span>
                <span className="text-xs text-theme-text-muted w-10 text-right">
                  {seg.percent.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
