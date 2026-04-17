import { useNavigate } from 'react-router-dom';
import type { ScoreLeaderboardTrader } from '../types';
import { RankBadge } from './RankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';
import { useFollowedTraders } from '../hooks/useFollowedTraders';
import { GenesisPassBadge } from '@nasun/wallet-ui';

interface ScoreTraderRowProps {
  trader: ScoreLeaderboardTrader;
  isCurrentUser?: boolean;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatScore(score: number): string {
  if (score >= 1_000_000) {
    return `${(score / 1_000_000).toFixed(1)}M`;
  }
  if (score >= 1_000) {
    return `${(score / 1_000).toFixed(1)}K`;
  }
  return score.toLocaleString();
}

function formatVolume(volumeUsd: string): string {
  const num = parseFloat(volumeUsd) || 0;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export function ScoreTraderRow({ trader, isCurrentUser }: ScoreTraderRowProps) {
  const navigate = useNavigate();
  const { isFollowing, toggleFollow } = useFollowedTraders();
  const displayName = trader.nickname || shortenAddress(trader.address);
  const followed = isFollowing(trader.address);

  return (
    <tr
      onClick={() => navigate(`/leaderboard/trader/${trader.address}`)}
      className={`transition-colors cursor-pointer ${
        isCurrentUser
          ? 'bg-pd3/5 hover:bg-pd3/10'
          : 'hover:bg-theme-bg-tertiary/30'
      }`}
    >
      <td className="py-3 px-3">
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); toggleFollow(trader.address); }}
            className={`shrink-0 transition-colors ${
              followed ? 'text-yellow-400' : 'text-theme-text-muted/60 hover:text-yellow-400/80'
            }`}
            title={followed ? 'Unfollow' : 'Follow'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={followed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <RankBadge rank={trader.rank} />
        </div>
      </td>
      <td className="py-3 px-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-medium ${isCurrentUser ? 'text-pd3' : 'text-theme-text-primary'}`}>
              {displayName}
            </span>
            {trader.twitterHandle && (
              <a
                href={`https://x.com/${trader.twitterHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-theme-text-muted hover:text-theme-text-primary transition-colors opacity-80"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
            )}
            {trader.hasGenesisPass && <GenesisPassBadge />}
          </div>
          {trader.nickname && (
            <span className="text-sm text-theme-text-muted font-mono opacity-80">
              {shortenAddress(trader.address)}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-3 text-right">
        <span className="text-sm font-mono font-medium text-pd3">
          {formatScore(trader.totalScore)}
        </span>
      </td>
      <td className="py-3 px-3 text-right">
        <span className="text-sm text-theme-text-secondary">
          {formatVolume(trader.volumeUsd)}
        </span>
      </td>
      <td className="py-3 px-3 text-right">
        <span className="text-sm text-theme-text-secondary">
          {trader.tradeCount.toLocaleString()}
        </span>
      </td>
      <td className="py-3 px-3 text-center">
        <RankChangeIndicator change={trader.rankChange} />
      </td>
    </tr>
  );
}
