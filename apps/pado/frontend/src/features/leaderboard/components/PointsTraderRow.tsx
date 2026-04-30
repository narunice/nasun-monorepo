import { useNavigate } from 'react-router-dom';
import { useProfile } from '@nasun/profile-react';
import type { PointsLeaderboardTrader } from '../types';
import { RankBadge } from './RankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';
import { useFollowedTraders } from '../hooks/useFollowedTraders';
import { GenesisPassBadge } from '@nasun/wallet-ui';

const PROFILE_API = (import.meta.env.VITE_NASUN_USER_PROFILE_API as string | undefined) ?? '';

interface PointsTraderRowProps {
  trader: PointsLeaderboardTrader;
  isCurrentUser?: boolean;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatPoints(points: number | null | undefined): string {
  const p = points ?? 0;
  if (p >= 1_000_000) {
    return `${(p / 1_000_000).toFixed(1)}M`;
  }
  if (p >= 1_000) {
    return `${(p / 1_000).toFixed(1)}K`;
  }
  return p.toLocaleString();
}

function formatVolume(volumeUsd: string): string {
  const num = parseFloat(volumeUsd) || 0;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export function PointsTraderRow({ trader, isCurrentUser }: PointsTraderRowProps) {
  const navigate = useNavigate();
  const { isFollowing, toggleFollow } = useFollowedTraders();
  const { data: profile } = useProfile(trader.address, { endpoint: PROFILE_API });
  const displayName =
    profile?.customDisplayName || trader.nickname || shortenAddress(trader.address);
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
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); toggleFollow(trader.address); }}
            className={`shrink-0 transition-colors ${
              followed ? 'text-yellow-400' : 'text-theme-text-muted/30 hover:text-yellow-400/60'
            }`}
            title={followed ? 'Unfollow' : 'Follow'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={followed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <RankBadge rank={trader.rank} />
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-medium ${isCurrentUser ? 'text-pd3' : 'text-theme-text-primary'}`}>
              {displayName}
            </span>
            {trader.hasGenesisPass && <GenesisPassBadge />}
          </div>
          {(profile?.customDisplayName || trader.nickname) && (
            <span className="text-xs text-theme-text-muted font-mono">
              {shortenAddress(trader.address)}
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono font-medium text-pd3">
          {formatPoints(trader.totalPoints)}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className="text-xs text-theme-text-secondary">
          {formatVolume(trader.volumeUsd)}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm text-theme-text-secondary">
          {(trader.tradeCount ?? 0).toLocaleString()}
        </span>
      </td>
      <td className="py-2.5 px-3 text-center">
        <RankChangeIndicator change={trader.rankChange} />
      </td>
    </tr>
  );
}
