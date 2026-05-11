import { useId } from 'react';
import type { RecentFill } from '../../types';

interface ProbabilitySparklineProps {
  fills: RecentFill[];
  isLoading: boolean;
  currentProbability?: number;
  width?: number;
  height?: number;
  className?: string;
}

export function ProbabilitySparkline({
  fills,
  isLoading,
  currentProbability,
  width = 120,
  height = 44,
  className,
}: ProbabilitySparklineProps) {
  const baseId = useId();
  const PAD = 3;

  if (isLoading || fills.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} preserveAspectRatio="none" aria-hidden>
        <line
          x1={PAD} y1={height / 2}
          x2={width - PAD} y2={height / 2}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4,3"
          className="text-theme-border"
        />
      </svg>
    );
  }

  // fills are descending (newest first) — reverse to chronological
  const sorted = [...fills].sort((a, b) => a.timestamp - b.timestamp);

  // Bucket fills into N time intervals and average YES probability per bucket.
  // This cancels out bid-ask bounce from LP market-making (YES/NO alternation).
  const BUCKETS = 12;
  const tMin = sorted[0].timestamp;
  const tMax = sorted[sorted.length - 1].timestamp;
  const tRange = tMax - tMin || 1;

  const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
  for (const f of sorted) {
    const idx = Math.min(BUCKETS - 1, Math.floor(((f.timestamp - tMin) / tRange) * BUCKETS));
    buckets[idx].push((f.isYes ? f.price : 10000 - f.price) / 100);
  }

  // Only keep buckets that have data; compute average per bucket.
  const probs = buckets
    .map((b) => b.length > 0 ? b.reduce((s, v) => s + v, 0) / b.length : null)
    .filter((v): v is number => v !== null);

  // If fewer than 2 fills, show flat line at currentProbability (price discovery exists
  // but fill history is too old to appear in the recent event window).
  if (probs.length < 2) {
    if (currentProbability == null) {
      return (
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} preserveAspectRatio="none" aria-hidden>
          <line
            x1={PAD} y1={height / 2}
            x2={width - PAD} y2={height / 2}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4,3"
            className="text-theme-border"
          />
        </svg>
      );
    }
    // Flat line at currentProbability
    const y = PAD + (height - PAD * 2) * (1 - currentProbability / 100);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} preserveAspectRatio="none" aria-hidden>
        <line
          x1={PAD} y1={y}
          x2={width - PAD} y2={y}
          stroke={currentProbability >= 50 ? '#22c55e' : '#ef4444'}
          strokeWidth="1.5"
          strokeOpacity="0.5"
          strokeDasharray="4,3"
        />
      </svg>
    );
  }

  const rawMin = Math.min(...probs);
  const rawMax = Math.max(...probs);
  // Enforce a minimum 20pp display window so small bid-ask spread variations
  // don't get stretched to full chart height and look like extreme swings.
  const midP = (rawMin + rawMax) / 2;
  const halfRange = Math.max((rawMax - rawMin) / 2, 10);
  const minP = Math.max(0, midP - halfRange);
  const maxP = Math.min(100, midP + halfRange);
  const range = maxP - minP;

  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;

  const toPoint = (p: number, i: number) => {
    const x = PAD + (i / (probs.length - 1)) * innerW;
    const y = PAD + innerH - ((p - minP) / range) * innerH;
    return { x, y };
  };

  const points = probs.map(toPoint);
  const polylineStr = points.map((pt) => `${pt.x},${pt.y}`).join(' ');

  // Close area: last point → bottom-right → bottom-left → first point
  const first = points[0];
  const last = points[points.length - 1];
  const areaStr = [
    ...points.map((pt) => `${pt.x},${pt.y}`),
    `${last.x},${height - PAD}`,
    `${first.x},${height - PAD}`,
  ].join(' ');

  const trend = probs[probs.length - 1] - probs[0];
  const color = trend > 0.5 ? '#22c55e' : trend < -0.5 ? '#ef4444' : '#7d9dbf';
  const gradId = `spark-grad-${baseId}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} preserveAspectRatio="none" aria-hidden overflow="visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaStr} fill={`url(#${gradId})`} />
      <polyline
        points={polylineStr}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
