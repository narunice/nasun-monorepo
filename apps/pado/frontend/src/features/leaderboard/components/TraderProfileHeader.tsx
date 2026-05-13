import { useProfile } from '@nasun/profile-react';
import { NETWORK_CONFIG } from '../../../config/network';
import { RankBadge } from './RankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';
import { TraderAvatar } from './TraderAvatar';
import { BadgeDisplay } from './BadgeDisplay';
import { GenesisPassBadge } from '@nasun/wallet-ui';
import { computeBadges } from '../lib/badges';
import { isValidXHandle, xProfileUrl } from '../lib/x-handle';
import { FaXTwitter } from 'react-icons/fa6';
import { useFollowedTraders } from '../hooks/useFollowedTraders';
import type { TraderStatsResponse } from '../types';
import { PERIOD_LABELS } from '../types';
import type { Period } from '../types';
import type { TraderClassification } from '../hooks/useTraderClassification';

const ACTIVE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const PROFILE_API = (import.meta.env.VITE_NASUN_USER_PROFILE_API as string | undefined) ?? '';

const STYLE_COLORS: Record<string, string> = {
  'scalper': 'text-red-400 bg-red-400/10',
  'day-trader': 'text-orange-400 bg-orange-400/10',
  'swing-trader': 'text-blue-400 bg-blue-400/10',
  'holder': 'text-emerald-400 bg-emerald-400/10',
};

interface TraderProfileHeaderProps {
  address: string;
  stats: TraderStatsResponse | undefined;
  classification?: TraderClassification;
  isLoading: boolean;
  followerCount?: number;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatVolume(volumeStr: string): string {
  const num = parseFloat(volumeStr);
  if (isNaN(num)) return '$0.00';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

const PERIODS: Period[] = ['24h', '7d', '30d', 'all'];

export function TraderProfileHeader({ address, stats, classification, isLoading, followerCount: followerCountProp }: TraderProfileHeaderProps) {
  const { data: profile } = useProfile(address, { endpoint: PROFILE_API });
  const nickname = profile?.resolvedDisplayName || stats?.nickname;
  const explorerUrl = NETWORK_CONFIG.explorerUrl;
  const { isFollowing, toggleFollow, followCount: followingCount } = useFollowedTraders();
  const followed = isFollowing(address);
  const earnedBadges = computeBadges(stats);
  const isActive = stats?.lastTradeAt != null && Date.now() - stats.lastTradeAt < ACTIVE_THRESHOLD_MS;
  const followerCount = followerCountProp ?? 0;

  return (
    <div className="bg-theme-bg-secondary rounded-lg border border-theme-border p-5">
      {/* Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <TraderAvatar walletAddress={address} profileImageUrl={stats?.profileImageUrl} size={53} />
          <div>
            {nickname ? (
              <div>
                <div className="flex items-center gap-2">
                  {isActive && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" title="Active" />}
                  <h2 className="text-lg font-semibold text-theme-text-primary">
                    {nickname}
                  </h2>
                  {stats?.hasGenesisPass && <GenesisPassBadge />}
                  {isValidXHandle(stats?.twitterHandle) && (
                    <a
                      href={xProfileUrl(stats.twitterHandle!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-theme-text-muted/60 hover:text-sky-400 transition-colors shrink-0"
                      title={`@${stats.twitterHandle} on X`}
                      aria-label={`Open @${stats.twitterHandle} on X`}
                    >
                      <FaXTwitter size={14} aria-hidden="true" />
                    </a>
                  )}
                  {isActive && <span className="hidden sm:inline text-xs text-green-400">Active</span>}
                  {classification && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STYLE_COLORS[classification.style] ?? 'text-theme-text-muted bg-theme-bg-tertiary'}`}>
                      {classification.label}
                    </span>
                  )}
                </div>
                <p className="text-sm text-theme-text-muted font-mono mt-0.5">
                  {shortenAddress(address)}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {isActive && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" title="Active" />}
                <h2 className="text-lg font-semibold text-theme-text-primary font-mono">
                  {shortenAddress(address)}
                </h2>
                {stats?.hasGenesisPass && <GenesisPassBadge />}
                {isValidXHandle(stats?.twitterHandle) && (
                  <a
                    href={xProfileUrl(stats.twitterHandle!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-theme-text-muted/60 hover:text-sky-400 transition-colors shrink-0"
                    title={`@${stats.twitterHandle} on X`}
                    aria-label={`Open @${stats.twitterHandle} on X`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
                  </a>
                )}
                {isActive && <span className="hidden sm:inline text-xs text-green-400">Active</span>}
                {classification && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STYLE_COLORS[classification.style] ?? 'text-theme-text-muted bg-theme-bg-tertiary'}`}>
                    {classification.label}
                  </span>
                )}
              </div>
            )}
            {earnedBadges.length > 0 && (
              <div className="mt-1.5">
                <BadgeDisplay badges={earnedBadges} />
              </div>
            )}
            {/* Follower count */}
            <div className="text-xs text-theme-text-muted mt-1">
              {followerCount < 10 ? '< 10' : followerCount} followers
              <span className="hidden sm:inline"> &middot; {followingCount} following</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => toggleFollow(address)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors min-h-[44px] w-full sm:w-auto ${
              followed
                ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400'
                : 'border-theme-border hover:border-theme-text-muted text-theme-text-muted hover:text-theme-text-secondary'
            }`}
          >
            {followed ? 'Following' : 'Follow'}
          </button>
          {explorerUrl && (
            <a
              href={`${explorerUrl}/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-pd3 hover:text-pd3/80 transition-colors"
            >
              View on Explorer
            </a>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {PERIODS.map((p) => (
            <div key={p} className="animate-pulse">
              <div className="h-3 bg-theme-bg-tertiary rounded w-8 mb-2" />
              <div className="h-5 bg-theme-bg-tertiary rounded w-12 mb-1" />
              <div className="h-3 bg-theme-bg-tertiary rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {PERIODS.map((period) => {
            const periodStats = stats?.stats[period];
            return (
              <div
                key={period}
                className="bg-theme-bg-primary rounded-lg p-3 text-center"
              >
                <div className="text-xs font-medium text-theme-text-muted mb-1.5">
                  {PERIOD_LABELS[period]}
                </div>
                {periodStats ? (
                  <>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <RankBadge rank={periodStats.rank} />
                      <RankChangeIndicator change={periodStats.rankChange} />
                    </div>
                    <div className="text-sm font-mono text-theme-text-primary">
                      {formatVolume(periodStats.volume)}
                    </div>
                    <div className="text-xs text-theme-text-muted mt-0.5">
                      {periodStats.tradeCount} trades
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-theme-text-muted py-2">
                    No activity
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
