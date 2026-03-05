/**
 * TokenSparkline — 48x24 SVG mini chart for token price history.
 * Shows 24h price trend in green (up) or red (down).
 * Falls back to a gray flat line when data is insufficient.
 */

interface TokenSparklineProps {
  prices: number[];
}

export function TokenSparkline({ prices }: TokenSparklineProps) {
  const width = 48;
  const height = 24;

  if (prices.length < 2) {
    // Flat gray line placeholder
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#6b7280" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 2;

  const points = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - ((p - min) / range) * (height - pad * 2) - pad;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const isUp = prices[prices.length - 1] >= prices[0];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke={isUp ? '#22c55e' : '#ef4444'}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
