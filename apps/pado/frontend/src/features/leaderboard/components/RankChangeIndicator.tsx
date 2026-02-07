interface RankChangeIndicatorProps {
  change: number;
}

export function RankChangeIndicator({ change }: RankChangeIndicatorProps) {
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-400">
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 2L10 8H2L6 2Z" />
        </svg>
        {change}
      </span>
    );
  }

  if (change < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 10L2 4H10L6 10Z" />
        </svg>
        {Math.abs(change)}
      </span>
    );
  }

  return (
    <span className="text-xs text-theme-text-muted">-</span>
  );
}
