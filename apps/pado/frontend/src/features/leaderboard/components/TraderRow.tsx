import type { LeaderboardTrader } from '../types';
import { RankBadge } from './RankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';

interface TraderRowProps {
  trader: LeaderboardTrader;
  isCurrentUser?: boolean;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatVolume(volumeUsd: string): string {
  const num = parseFloat(volumeUsd);
  if (isNaN(num)) return '$0.00';

  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(2)}K`;
  }
  return `$${num.toFixed(2)}`;
}

export function TraderRow({ trader, isCurrentUser }: TraderRowProps) {
  const displayName = trader.nickname || shortenAddress(trader.address);

  return (
    <tr
      className={`transition-colors ${
        isCurrentUser
          ? 'bg-pd3/5 hover:bg-pd3/10'
          : 'hover:bg-theme-bg-tertiary/30'
      }`}
    >
      <td className="py-2.5 px-3">
        <RankBadge rank={trader.rank} />
      </td>
      <td className="py-2.5 px-3">
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${isCurrentUser ? 'text-pd3' : 'text-theme-text-primary'}`}>
            {displayName}
          </span>
          {trader.nickname && (
            <span className="text-xs text-theme-text-muted font-mono">
              {shortenAddress(trader.address)}
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-theme-text-primary">
          {formatVolume(trader.volumeUsd)}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm text-theme-text-secondary">
          {trader.tradeCount.toLocaleString()}
        </span>
      </td>
      <td className="py-2.5 px-3 text-center">
        <RankChangeIndicator change={trader.rankChange} />
      </td>
    </tr>
  );
}
