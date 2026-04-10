/**
 * GameActivityList
 * Unified timeline of game activities with mobile card / desktop list layout.
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiExternalLink } from 'react-icons/fi';
import { formatNusdc } from '../../../lib/format';
import { getExplorerTxUrl } from '../../../lib/explorer';
import type { GameActivity, GameType } from '../types';

const ITEMS_PER_PAGE = 10;

// -- Badge styles --

const GAME_BADGE: Record<GameType, { label: string; className: string }> = {
  lottery: {
    label: 'Lottery',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
  scratch: {
    label: 'Scratch',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  numbermatch: {
    label: 'Match',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
};

function ResultBadge({ result, payout }: { result: GameActivity['result']; payout: bigint }) {
  if (result === 'win') {
    return (
      <span className="text-green-600 dark:text-green-400 font-medium text-sm">
        +{formatNusdc(payout)}
      </span>
    );
  }
  if (result === 'pending') {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
        Pending
      </span>
    );
  }
  // loss
  if (payout > 0n) {
    return <span className="text-theme-text-muted text-sm">+{formatNusdc(payout)}</span>;
  }
  return <span className="text-theme-text-muted text-sm">-</span>;
}

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// -- Mobile card --

function ExplorerLink({ txDigest }: { txDigest: string }) {
  return (
    <a
      href={getExplorerTxUrl(txDigest)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-theme-text-muted hover:text-theme-accent transition-colors"
      title="View on Explorer"
    >
      <FiExternalLink className="w-3.5 h-3.5" />
    </a>
  );
}

function ActivityCard({ activity }: { activity: GameActivity }) {
  const badge = GAME_BADGE[activity.gameType];

  return (
    <div className="p-4 hover:bg-theme-bg-tertiary/30 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
          <span className="text-sm text-theme-text-secondary">{activity.detail}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-text-muted">{formatTime(activity.timestampMs)}</span>
          <ExplorerLink txDigest={activity.txDigest} />
        </div>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-theme-text-muted">-{formatNusdc(activity.spent)} NUSDC</span>
        <ResultBadge result={activity.result} payout={activity.payout} />
      </div>
    </div>
  );
}

// -- Desktop row --

function ActivityRow({ activity }: { activity: GameActivity }) {
  const badge = GAME_BADGE[activity.gameType];

  return (
    <tr className="border-b border-theme-border hover:bg-theme-bg-tertiary/30 transition-colors">
      <td className="py-3 px-3 text-xs text-theme-text-muted whitespace-nowrap">
        {formatTime(activity.timestampMs)}
      </td>
      <td className="py-3 px-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </td>
      <td className="py-3 px-3 text-sm text-theme-text-secondary">{activity.detail}</td>
      <td className="py-3 px-3 text-sm text-right text-theme-text-muted">
        {formatNusdc(activity.spent)}
      </td>
      <td className="py-3 px-3 text-right">
        <ResultBadge result={activity.result} payout={activity.payout} />
      </td>
      <td className="py-3 px-3 text-center">
        <ExplorerLink txDigest={activity.txDigest} />
      </td>
    </tr>
  );
}

// -- Skeleton --

function SkeletonRows() {
  return (
    <div className="space-y-0 divide-y divide-theme-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="p-4 animate-pulse flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-5 w-14 bg-theme-bg-tertiary rounded" />
            <div className="h-4 w-32 bg-theme-bg-tertiary rounded" />
          </div>
          <div className="h-4 w-16 bg-theme-bg-tertiary rounded" />
        </div>
      ))}
    </div>
  );
}

// -- Empty state --

function EmptyState() {
  return (
    <div className="text-center py-12 text-theme-text-muted">
      <p className="mb-4">No game activity yet.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          to="/games/lottery"
          className="px-3 py-1.5 text-sm rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 hover:opacity-80"
        >
          Try Lottery
        </Link>
        <Link
          to="/games/scratch"
          className="px-3 py-1.5 text-sm rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:opacity-80"
        >
          Try Scratch Cards
        </Link>
        <Link
          to="/games/numbermatch"
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:opacity-80"
        >
          Try Number Match
        </Link>
      </div>
    </div>
  );
}

// -- Main component --

interface Props {
  activities: GameActivity[];
  isLoading: boolean;
  error: string | null;
}

export function GameActivityList({ activities, isLoading, error }: Props) {
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);

  const visible = useMemo(
    () => activities.slice(0, displayCount),
    [activities, displayCount],
  );

  const hasMore = displayCount < activities.length;

  if (isLoading) return <SkeletonRows />;

  if (error) {
    return (
      <div className="text-center py-8 text-red-500 dark:text-red-400">
        <p>Failed to load history.</p>
      </div>
    );
  }

  if (activities.length === 0) return <EmptyState />;

  return (
    <div>
      {/* Mobile: card layout */}
      <div className="md:hidden divide-y divide-theme-border bg-theme-bg-secondary rounded-lg">
        {visible.map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden md:block bg-theme-bg-secondary rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-theme-border text-xs text-theme-text-muted">
              <th className="py-2 px-3 text-left font-medium">Time</th>
              <th className="py-2 px-3 text-left font-medium">Game</th>
              <th className="py-2 px-3 text-left font-medium">Detail</th>
              <th className="py-2 px-3 text-right font-medium">Spent</th>
              <th className="py-2 px-3 text-right font-medium">Payout</th>
              <th className="py-2 px-3 text-center font-medium w-10">Tx</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <ActivityRow key={a.id} activity={a} />
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setDisplayCount((c) => c + ITEMS_PER_PAGE)}
            className="px-4 py-2 text-sm text-theme-accent hover:text-theme-accent-hover transition-colors"
          >
            Load More ({activities.length - displayCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
