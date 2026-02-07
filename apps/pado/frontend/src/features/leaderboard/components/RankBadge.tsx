interface RankBadgeProps {
  rank: number;
}

const MEDAL_STYLES: Record<number, string> = {
  1: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  2: 'bg-gray-400/20 text-gray-300 border-gray-400/30',
  3: 'bg-amber-600/20 text-amber-500 border-amber-600/30',
};

const MEDAL_LABELS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
};

export function RankBadge({ rank }: RankBadgeProps) {
  const medalStyle = MEDAL_STYLES[rank];

  if (medalStyle) {
    return (
      <span
        className={`inline-flex items-center justify-center w-8 h-6 rounded border text-xs font-bold ${medalStyle}`}
      >
        {MEDAL_LABELS[rank]}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center w-8 h-6 text-xs font-mono text-theme-text-muted">
      {rank}
    </span>
  );
}
