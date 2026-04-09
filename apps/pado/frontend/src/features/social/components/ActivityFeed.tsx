import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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

interface DateGroup {
  label: string;
  activities: FeedActivity[];
}

function groupByDate(activities: FeedActivity[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let currentLabel = '';

  for (const activity of activities) {
    const label = getDateLabel(activity.timestamp);
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, activities: [activity] });
    } else {
      groups[groups.length - 1].activities.push(activity);
    }
  }

  return groups;
}

interface ActivityFeedProps {
  onBrowseLeaderboard?: () => void;
}

export function ActivityFeed({ onBrowseLeaderboard }: ActivityFeedProps) {
  // Ensure WebSocket is connected for session token (needed by feed API)
  useChat();

  const navigate = useNavigate();
  const [beforeTs, setBeforeTs] = useState<number | undefined>();
  const [allActivities, setAllActivities] = useState<FeedActivity[]>([]);

  const { data, isLoading, isFetching } = useActivityFeed(30, beforeTs);

  // Merge initial + paginated results
  const activities = useMemo(() => {
    if (!data?.activities) return allActivities;
    if (beforeTs == null) return data.activities;
    // Append new page to existing (dedup by txDigest + traderAddress)
    const existingIds = new Set(allActivities.map((a) => `${a.data.txDigest}-${a.traderAddress}`));
    const newItems = data.activities.filter((a) => !existingIds.has(`${a.data.txDigest}-${a.traderAddress}`));
    return [...allActivities, ...newItems];
  }, [data, beforeTs, allActivities]);

  const groups = useMemo(() => groupByDate(activities), [activities]);

  const handleLoadMore = () => {
    if (!data?.hasMore || activities.length === 0) return;
    setAllActivities(activities);
    const lastTs = activities[activities.length - 1].timestamp;
    setBeforeTs(lastTs);
  };

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
            {group.activities.map((activity) => (
              <ActivityCard
                key={`${activity.data.txDigest}-${activity.traderAddress}`}
                activity={activity}
              />
            ))}
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
