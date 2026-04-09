import { Link } from 'react-router-dom';
import type { FeedActivity } from '../types';
import { getExplorerTxUrl } from '@/lib/explorer';

interface ActivityCardProps {
  activity: FeedActivity;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatPrice(priceStr: string): string {
  const num = parseFloat(priceStr);
  if (isNaN(num)) return '$0';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

export function ActivityCard({ activity }: ActivityCardProps) {
  const { data } = activity;
  const displayName = activity.traderNickname ?? shortenAddress(activity.traderAddress);
  const isBuy = data.side === 'buy';

  return (
    <div className="w-full text-left bg-theme-bg-secondary rounded-lg border border-theme-border p-3 min-h-[56px] flex items-center">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 w-full">
        <div className="flex items-center gap-2">
          <Link
            to={`/leaderboard/trader/${activity.traderAddress}`}
            className="text-sm font-medium text-theme-text-primary truncate max-w-[120px] hover:text-pd3 transition-colors"
          >
            {displayName}
          </Link>
          <span className={`text-xs font-medium ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
            {isBuy ? 'bought' : 'sold'}
          </span>
          <span className="text-sm text-theme-text-secondary font-mono">
            {parseFloat(data.baseQuantity).toFixed(4)} {data.pair.split('/')[0]}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-theme-text-muted">
          <span>@ {formatPrice(data.price)}</span>
          <span>&middot;</span>
          <span>{formatTimeAgo(activity.timestamp)}</span>
          {data.txDigest && (
            <a
              href={getExplorerTxUrl(data.txDigest)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-theme-text-muted hover:text-pd3 transition-colors"
              title="View on Explorer"
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
