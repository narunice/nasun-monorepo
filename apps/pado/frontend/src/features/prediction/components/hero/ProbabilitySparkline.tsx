import { useId } from 'react';
import type { RecentFill } from '../../types';

interface ProbabilitySparklineProps {
  fills: RecentFill[];
  isLoading: boolean;
  currentProbability?: number;
  className?: string;
}

const VB_W = 600;
const VB_H = 200;
const PAD_TOP = 4;
const PAD_BOTTOM = 4;
const PAD_X = 4;

const YES_COLOR = '#22c55e';
const NO_COLOR = '#ef4444';

export function ProbabilitySparkline({
  fills,
  isLoading,
  currentProbability,
  className,
}: ProbabilitySparklineProps) {
  const baseId = useId();
  const yesGradId = `spark-yes-${baseId}`;
  const noGradId = `spark-no-${baseId}`;

  // Bucket fills into equal-width time intervals so bid-ask bounce from
  // LP market-making (rapid YES/NO alternation) averages out instead of
  // turning the line into a high-frequency sawtooth.
  const sorted = [...fills].sort((a, b) => a.timestamp - b.timestamp);
  const BUCKETS = 24;
  const tMin = sorted.length > 0 ? sorted[0].timestamp : 0;
  const tMax = sorted.length > 0 ? sorted[sorted.length - 1].timestamp : 0;
  const tRange = tMax - tMin || 1;

  const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
  for (const f of sorted) {
    const idx = Math.min(BUCKETS - 1, Math.floor(((f.timestamp - tMin) / tRange) * BUCKETS));
    buckets[idx].push((f.isYes ? f.price : 10000 - f.price) / 100);
  }
  const yesProbs = buckets
    .map((b) => (b.length > 0 ? b.reduce((s, v) => s + v, 0) / b.length : null))
    .filter((v): v is number => v !== null);

  const hasSeries = !isLoading && yesProbs.length >= 2;

  // Full 0~100 display window so YES (top) and NO (bottom) reads symmetrically
  // about the 50% guide line, matching the Polymarket/Kalshi convention.
  const minP = 0;
  const maxP = 100;
  const range = maxP - minP;

  const innerW = VB_W - PAD_X * 2;
  const innerH = VB_H - PAD_TOP - PAD_BOTTOM;

  const toPoint = (p: number, i: number, n: number) => {
    const x = PAD_X + (i / Math.max(1, n - 1)) * innerW;
    const y = PAD_TOP + innerH - ((p - minP) / range) * innerH;
    return { x, y };
  };

  const yesPoints = hasSeries
    ? yesProbs.map((p, i) => toPoint(p, i, yesProbs.length))
    : [];
  const noPoints = hasSeries
    ? yesProbs.map((p, i) => toPoint(100 - p, i, yesProbs.length))
    : [];

  const yesPolyline = yesPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');
  const noPolyline = noPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');

  // Mid-line Y coordinate for stacked-fill anchoring.
  const midY = PAD_TOP + innerH * 0.5;

  // YES area: from each YES point down to the 50% guide
  const yesAreaStr = hasSeries
    ? [
        ...yesPoints.map((pt) => `${pt.x},${pt.y}`),
        `${yesPoints[yesPoints.length - 1].x},${midY}`,
        `${yesPoints[0].x},${midY}`,
      ].join(' ')
    : '';
  // NO area: from each NO point up to the 50% guide
  const noAreaStr = hasSeries
    ? [
        ...noPoints.map((pt) => `${pt.x},${pt.y}`),
        `${noPoints[noPoints.length - 1].x},${midY}`,
        `${noPoints[0].x},${midY}`,
      ].join(' ')
    : '';

  const yesLast = yesPoints[yesPoints.length - 1];
  const noLast = noPoints[noPoints.length - 1];

  // Always prefer the orderbook-derived currentProbability for the "Now" badge.
  // hasSeries fill-derived probability reflects the last trade, not the current market.
  const currentYes = currentProbability ?? (hasSeries ? yesProbs[yesProbs.length - 1] : undefined);
  const currentNo = currentYes != null ? 100 - currentYes : undefined;
  const startLabel = hasSeries ? formatTimeLabel(tMin) : null;

  return (
    <div className={`relative w-full h-full ${className ?? ''}`}>
      {/* Y-axis labels (left edge), as HTML so they don't stretch with the SVG */}
      <div className="absolute inset-y-1 left-0 flex flex-col justify-between pointer-events-none text-[10px] tabular-nums text-theme-text-muted pb-5 pt-1">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>

      {/* Chart area (offset to leave room for Y labels on the left, current values on the right) */}
      <div className="absolute inset-0 pl-8 pr-14 pb-5 pt-1">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id={yesGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={YES_COLOR} stopOpacity="0.32" />
              <stop offset="100%" stopColor={YES_COLOR} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={noGradId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={NO_COLOR} stopOpacity="0.32" />
              <stop offset="100%" stopColor={NO_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 50% midline */}
          <line
            x1={PAD_X}
            x2={VB_W - PAD_X}
            y1={midY}
            y2={midY}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="4 4"
            className="text-theme-border"
            opacity={0.55}
            vectorEffect="non-scaling-stroke"
          />

          {hasSeries ? (
            <>
              {/* Fills first so polylines render on top */}
              <polygon points={yesAreaStr} fill={`url(#${yesGradId})`} />
              <polygon points={noAreaStr} fill={`url(#${noGradId})`} />

              {/* NO line (red, mirror) */}
              <polyline
                points={noPolyline}
                fill="none"
                stroke={NO_COLOR}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={0.85}
                vectorEffect="non-scaling-stroke"
              />
              {/* YES line (green) */}
              <polyline
                points={yesPolyline}
                fill="none"
                stroke={YES_COLOR}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />

              {/* End-point markers */}
              {yesLast && (
                <circle
                  cx={yesLast.x}
                  cy={yesLast.y}
                  r={4}
                  fill={YES_COLOR}
                  stroke="#fff"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {noLast && (
                <circle
                  cx={noLast.x}
                  cy={noLast.y}
                  r={4}
                  fill={NO_COLOR}
                  stroke="#fff"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </>
          ) : (
            // Empty state: flat dashed lines at current probability (or 50/50)
            <>
              <line
                x1={PAD_X}
                y1={PAD_TOP + innerH - ((currentYes ?? 50) / 100) * innerH}
                x2={VB_W - PAD_X}
                y2={PAD_TOP + innerH - ((currentYes ?? 50) / 100) * innerH}
                stroke={YES_COLOR}
                strokeWidth="1.5"
                strokeDasharray="6 6"
                strokeOpacity="0.5"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={PAD_X}
                y1={PAD_TOP + innerH - ((currentNo ?? 50) / 100) * innerH}
                x2={VB_W - PAD_X}
                y2={PAD_TOP + innerH - ((currentNo ?? 50) / 100) * innerH}
                stroke={NO_COLOR}
                strokeWidth="1.5"
                strokeDasharray="6 6"
                strokeOpacity="0.5"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
      </div>

      {/* Current YES / NO badges — vertically centered on the 50% guide line.
          Uses the same inset-y-1 + pb-5 + pt-1 as the chart area so the
          midpoint matches the chart's midY exactly. */}
      {currentYes != null && currentNo != null && (
        <div className="absolute inset-y-1 right-0 pb-5 pt-1 flex flex-col justify-center items-end gap-0.5 pointer-events-none">
          <div className="flex items-baseline gap-1">
            <span className="text-[10px] uppercase tracking-wide text-theme-text-muted">YES</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: YES_COLOR }}>
              {currentYes.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[10px] uppercase tracking-wide text-theme-text-muted">NO</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: NO_COLOR }}>
              {currentNo.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* X-axis labels (bottom) */}
      <div className="absolute inset-x-0 bottom-0 pl-8 pr-14 flex justify-between text-[10px] text-theme-text-muted tabular-nums pointer-events-none">
        <span>{startLabel ?? '—'}</span>
        <span>Now</span>
      </div>

      {/* Empty-state message when we don't have enough fills to draw a line */}
      {!hasSeries && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-theme-text-muted italic">
            Awaiting first trades
          </span>
        </div>
      )}
    </div>
  );
}

function formatTimeLabel(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const diffH = (now - ms) / 3_600_000;
  if (diffH < 24) {
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
