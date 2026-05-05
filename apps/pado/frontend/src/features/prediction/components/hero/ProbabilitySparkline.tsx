import { useId } from 'react';
import type { RecentFill } from '../../types';

interface ProbabilitySparklineProps {
  fills: RecentFill[];
  isLoading: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export function ProbabilitySparkline({
  fills,
  isLoading,
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
  const sorted = [...fills].reverse();
  const probs = sorted.map((f) => f.price / 100); // bps -> 0..100

  const minP = Math.min(...probs);
  const maxP = Math.max(...probs);
  const range = maxP - minP || 1;

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
