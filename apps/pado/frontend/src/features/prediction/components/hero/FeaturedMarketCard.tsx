import { Link } from 'react-router-dom';
import type { PredictionMarket, Orderbook } from '../../types';
import { calculateProbabilityFromOrderbook } from '../../types';
import { useRecentFills } from '../../hooks/useRecentFills';
import { formatVolumeCompact } from '../../../../lib/format';
import { ProbabilitySparkline } from './ProbabilitySparkline';

interface FeaturedMarketCardProps {
  market: PredictionMarket;
  yesOrderbook: Orderbook | null;
}

function formatTimeRemaining(closeTime: number): string {
  const diff = closeTime - Date.now();
  if (diff <= 0) return 'Closing';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function FeaturedMarketCard({ market, yesOrderbook }: FeaturedMarketCardProps) {
  const { data: fills = [], isLoading: fillsLoading } = useRecentFills(market.id);
  const { yesProbability, hasRealOrders } = calculateProbabilityFromOrderbook(yesOrderbook, null);

  const probColor = yesProbability >= 60
    ? 'text-green-600 dark:text-green-400'
    : yesProbability <= 40
      ? 'text-red-600 dark:text-red-400'
      : 'text-theme-text-primary';

  return (
    <Link
      to={`/predict/${market.id}`}
      className="block shrink-0 w-[280px] sm:w-[320px] snap-start rounded-2xl bg-theme-bg-secondary p-4 hover:border-pd3/60 transition-all cursor-pointer"
    >
      {/* Category badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-pd1 dark:text-pd3 bg-pd5 dark:bg-pd0/30 px-2 py-0.5 rounded">
          {market.category}
        </span>
        {!hasRealOrders && (
          <span className="text-[10px] text-theme-text-muted">No orders yet</span>
        )}
      </div>

      {/* Question */}
      <p className="text-sm font-semibold text-theme-text-primary line-clamp-2 mb-3 leading-snug min-h-[2.5rem]">
        {market.question}
      </p>

      {/* Probability + Sparkline */}
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <div className={`text-3xl font-extrabold tabular-nums leading-none ${probColor}`}>
            {yesProbability.toFixed(0)}%
          </div>
          <div className="text-xs text-theme-text-muted mt-0.5">YES chance</div>
        </div>
        <ProbabilitySparkline fills={fills} isLoading={fillsLoading} width={110} height={44} />
      </div>

      {/* Footer: volume + time */}
      <div className="flex items-center justify-between text-xs text-theme-text-muted border-t border-theme-border/50 pt-2">
        <span>Vol: {formatVolumeCompact(market.totalVolume)} NUSDC</span>
        <span>{formatTimeRemaining(market.closeTime)}</span>
      </div>
    </Link>
  );
}
