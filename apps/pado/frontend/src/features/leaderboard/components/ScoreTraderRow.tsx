import { useNavigate } from 'react-router-dom';
import { useProfile } from '@nasun/profile-react';
import type { ScoreLeaderboardTrader } from '../types';
import { RankBadge } from './RankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';
import { TraderAvatar } from './TraderAvatar';
import { useFollowedTraders } from '../hooks/useFollowedTraders';
import { isValidXHandle, xProfileUrl } from '../lib/x-handle';
import { GenesisPassBadge } from '@nasun/wallet-ui';

const PROFILE_API = (import.meta.env.VITE_NASUN_USER_PROFILE_API as string | undefined) ?? '';

interface ScoreTraderRowProps {
  trader: ScoreLeaderboardTrader;
  isCurrentUser?: boolean;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatScore(score: number | null | undefined): string {
  const s = score ?? 0;
  if (s >= 1_000_000) {
    return `${(s / 1_000_000).toFixed(1)}M`;
  }
  if (s >= 1_000) {
    return `${(s / 1_000).toFixed(1)}K`;
  }
  return s.toLocaleString();
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
  const { data: profile } = useProfile(trader.address, { endpoint: PROFILE_API });
  const displayName =
    profile?.resolvedDisplayName || trader.nickname || shortenAddress(trader.address);
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
        <div className="flex items-center gap-2">
          <TraderAvatar walletAddress={trader.address} profileImageUrl={trader.profileImageUrl} size={31} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-medium ${isCurrentUser ? 'text-pd3' : 'text-theme-text-primary'}`}>
                {displayName}
              </span>
              {trader.hasGenesisPass && <GenesisPassBadge />}
              {isValidXHandle(trader.twitterHandle) && (
                <a
                  href={xProfileUrl(trader.twitterHandle)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-theme-text-muted/60 hover:text-sky-400 transition-colors shrink-0"
                  title={`@${trader.twitterHandle} on X`}
                  aria-label={`Open @${trader.twitterHandle} on X`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </a>
              )}
            </div>
            {(profile?.resolvedDisplayName || trader.nickname) && (
              <span className="text-sm text-theme-text-muted font-mono opacity-80">
                {shortenAddress(trader.address)}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-3 text-right">
        <span className="text-sm font-mono font-medium text-pd3">
          {formatScore(trader.totalScore)}
        </span>
      </td>
      <td className="py-3 px-2 text-center w-8">
        {trader.twitterHandle ? (
          <svg className="w-3 h-3 mx-auto text-sky-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        ) : null}
      </td>
      <td className="py-3 px-2 text-center w-8">
        {trader.hasGoogle ? (
          <svg className="w-3 h-3 mx-auto text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        ) : null}
      </td>
      <td className="py-3 px-2 text-center w-8">
        {trader.hasTelegram ? (
          <svg className="w-3 h-3 mx-auto text-violet-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        ) : null}
      </td>
      <td className="py-3 px-3 text-right hidden md:table-cell">
        <span className="text-sm text-theme-text-secondary">
          {formatVolume(trader.volumeUsd)}
        </span>
      </td>
      <td className="py-3 px-3 text-right hidden md:table-cell">
        <span className="text-sm text-theme-text-secondary">
          {(trader.tradeCount ?? 0).toLocaleString()}
        </span>
      </td>
      <td className="py-3 px-3 text-center">
        <RankChangeIndicator change={trader.rankChange} />
      </td>
    </tr>
  );
}
