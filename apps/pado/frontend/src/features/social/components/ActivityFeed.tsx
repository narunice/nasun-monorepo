import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignerAddress } from '@nasun/wallet';
import { useChat } from '../hooks/useChat';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { ActivityCard } from './ActivityCard';
import type { FeedActivity } from '../types';

function getDateLabel(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return 'Today';
  if (msgDate.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** A run of consecutive activities from the same trader within a date group */
interface TraderRun {
  traderAddress: string;
  activities: FeedActivity[];
}

interface DateGroup {
  label: string;
  runs: TraderRun[];
}

/**
 * Group activities by date, then by consecutive same-trader runs.
 * Consecutive trades from the same wallet become a single collapsible group.
 */
function groupByDateAndTrader(activities: FeedActivity[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let currentLabel = '';
  let currentGroup: DateGroup | null = null;

  for (const activity of activities) {
    const label = getDateLabel(activity.timestamp);

    if (label !== currentLabel) {
      currentLabel = label;
      currentGroup = { label, runs: [{ traderAddress: activity.traderAddress, activities: [activity] }] };
      groups.push(currentGroup);
    } else {
      const lastRun = currentGroup!.runs[currentGroup!.runs.length - 1];
      if (lastRun.traderAddress === activity.traderAddress) {
        lastRun.activities.push(activity);
      } else {
        currentGroup!.runs.push({ traderAddress: activity.traderAddress, activities: [activity] });
      }
    }
  }

  return groups;
}

interface ActivityFeedProps {
  onBrowseLeaderboard?: () => void;
}

export function ActivityFeed({ onBrowseLeaderboard }: ActivityFeedProps) {
  // Ensure WebSocket is connected for session token (needed by feed API)
  const { isConnected } = useChat();
  const signerAddress = useSignerAddress();

  const navigate = useNavigate();
  const [beforeTs, setBeforeTs] = useState<number | undefined>();
  const [allActivities, setAllActivities] = useState<FeedActivity[]>([]);

  const { data, isLoading, isFetching } = useActivityFeed(30, beforeTs);
  // Feed API needs a session token issued on WebSocket auth_success. Until the
  // chat session is established, the query is disabled, so isLoading stays
  // false and we'd otherwise flash the "Follow traders" empty state even for
  // users who already follow someone. Treat the pre-auth window as loading.
  const waitingForSession = !!signerAddress && !isConnected;

  // Merge initial + paginated results
  const activities = useMemo(() => {
    if (!data?.activities) return allActivities;
    if (beforeTs == null) return data.activities;
    // Append new page to existing (dedup by txDigest + traderAddress)
    const existingIds = new Set(allActivities.map((a) => `${a.data.txDigest}-${a.traderAddress}`));
    const newItems = data.activities.filter((a) => !existingIds.has(`${a.data.txDigest}-${a.traderAddress}`));
    return [...allActivities, ...newItems];
  }, [data, beforeTs, allActivities]);

  const groups = useMemo(() => groupByDateAndTrader(activities), [activities]);
  // Track which trader runs are expanded (key: "dateLabel-runIndex")
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const toggleRun = useCallback((key: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleLoadMore = () => {
    if (!data?.hasMore || activities.length === 0) return;
    setAllActivities(activities);
    const lastTs = activities[activities.length - 1].timestamp;
    setBeforeTs(lastTs);
  };

  // Loading / pre-auth skeleton
  if ((isLoading || waitingForSession) && activities.length === 0) {
    return (
      <div className="space-y-2 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-theme-bg-secondary rounded-lg border border-theme-border p-3 h-14" />
        ))}
      </div>
    );
  }

  // Empty state
  if (!isLoading && activities.length === 0) {
    const hasFollows = (data?.followCount ?? 0) > 0;
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-theme-text-muted mb-4">
          {hasFollows
            ? 'No recent trades from traders you follow'
            : 'Follow traders to see their activity'}
        </p>
        <button
          onClick={() => onBrowseLeaderboard ? onBrowseLeaderboard() : navigate('/leaderboard')}
          className="px-4 py-2.5 bg-theme-accent text-white rounded-lg text-sm font-medium hover:bg-theme-accent/80 transition-colors min-h-[44px] w-full sm:w-auto"
        >
          Browse Leaderboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <div key={group.label}>
          {/* Date divider */}
          <div className="flex items-center gap-2 py-2 px-1">
            <div className="flex-1 h-px bg-theme-border" />
            <span className="text-xs text-theme-text-muted font-medium">{group.label}</span>
            <div className="flex-1 h-px bg-theme-border" />
          </div>
          <div className="space-y-1.5">
            {group.runs.map((run, runIdx) => {
              if (run.activities.length === 1) {
                const a = run.activities[0];
                return (
                  <ActivityCard
                    key={`${a.data.txDigest}-${a.traderAddress}`}
                    activity={a}
                  />
                );
              }

              // Collapsible group for 2+ activities from the same trader
              const runKey = `${group.label}-${runIdx}`;
              const isExpanded = expandedRuns.has(runKey);
              const first = run.activities[0];
              const displayName = first.traderNickname ?? `${first.traderAddress.slice(0, 6)}...${first.traderAddress.slice(-4)}`;

              return (
                <div key={runKey}>
                  <button
                    onClick={() => toggleRun(runKey)}
                    className="w-full text-left bg-theme-bg-secondary rounded-lg border border-theme-border p-3 min-h-[44px] flex items-center justify-between hover:bg-theme-bg-tertiary transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-theme-text-primary truncate max-w-[120px]">
                        {displayName}
                      </span>
                      <span className="text-xs text-theme-text-muted">
                        {run.activities.length} trades
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-theme-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="space-y-1 mt-1 ml-3 border-l-2 border-theme-border pl-2">
                      {run.activities.map((a) => (
                        <ActivityCard
                          key={`${a.data.txDigest}-${a.traderAddress}`}
                          activity={a}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Load more */}
      {data?.hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={isFetching}
          className="w-full py-3 text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors min-h-[44px] border border-theme-border rounded-lg"
        >
          {isFetching ? 'Loading...' : 'Load More'}
        </button>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2 py-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-theme-bg-secondary rounded-lg border border-theme-border p-3 h-14" />
          ))}
        </div>
      )}
    </div>
  );
}
