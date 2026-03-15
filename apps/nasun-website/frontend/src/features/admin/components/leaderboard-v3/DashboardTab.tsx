/**
 * DashboardTab - Dashboard statistics for Leaderboard V3 Admin
 */

import { useState } from "react";
import { OuterBox } from "@/components/ui/OuterBox";
import { useAdminDashboard } from "../../hooks/useAdminDashboard";
import { PostEditModal } from "./PostEditModal";

interface EditablePost {
  postId: string;
  platform?: string;
  username?: string;
  originalUsername?: string;
  postUrl?: string;
  postScore?: number;
  postType?: string;
  accountRole?: string;
  contentSignals?: string[];
}

export function DashboardTab() {
  const { data: stats, isLoading, error } = useAdminDashboard();
  const [editingPost, setEditingPost] = useState<EditablePost | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="text-nasun-white/50 text-sm py-8 text-center">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6 w-full">
        <OuterBox color="c6" className="w-full !border-nasun-c5/30 !bg-gray-800/30">
          <div className="text-red-400 text-sm">
            Failed to load dashboard: {error instanceof Error ? error.message : "Unknown error"}
          </div>
        </OuterBox>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Posts" value={stats?.totalPosts?.toLocaleString() || "0"} />
        <StatCard title="Total Users" value={stats?.totalAccounts?.toLocaleString() || "0"} />
        <StatCard title="Active Season" value={stats?.activeSeason?.name || "None"} />
        <StatCard
          title="Today Posts"
          value={stats?.todayStats?.postsCreated?.toLocaleString() || "0"}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <OuterBox color="c6" className="w-full !border-nasun-c5/30 !bg-gray-800/30">
          <h3 className="text-lg font-medium text-nasun-white mb-4">Recent Activity</h3>
          {!stats?.recentActivity?.length ? (
            <div className="text-nasun-white/50 text-sm">No recent activity.</div>
          ) : (
            <div className="space-y-2">
              {stats.recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-sm py-2 border-b border-nasun-c5/10 last:border-0"
                >
                  <span className="text-nasun-c3 shrink-0">
                    {activity.type === "post_created" ? "📝" : "👤"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-nasun-white truncate">
                      {activity.originalUsername
                        ? `@${activity.originalUsername} - ${activity.accountRole?.toUpperCase() || ""} post registered`
                        : activity.description}
                    </div>
                    <div className="text-nasun-white/40 text-xs">
                      {formatTimestamp(activity.timestamp)}
                      {activity.postScore !== undefined && (
                        <span className="ml-2 text-nasun-c3">
                          Score: {activity.postScore.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </div>
                  {activity.postId && (
                    <button
                      onClick={() => {
                        setEditingPost({
                          postId: activity.postId!,
                          platform: activity.platform,
                          username: activity.username,
                          originalUsername: activity.originalUsername,
                          postUrl: activity.postUrl,
                          postScore: activity.postScore,
                          postType: activity.postType,
                          accountRole: activity.accountRole,
                          contentSignals: activity.contentSignals,
                        });
                        setEditModalOpen(true);
                      }}
                      className="shrink-0 px-2 py-1 text-xs text-nasun-white/60 hover:text-nasun-white bg-gray-700/50 hover:bg-gray-700 rounded-sm transition-all"
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </OuterBox>

        {/* Top 10 Preview */}
        <OuterBox color="c6" className="w-full !border-nasun-c5/30 !bg-gray-800/30">
          <h3 className="text-lg font-medium text-nasun-white mb-4">Top 10 This Season</h3>
          {!stats?.topFive?.length ? (
            <div className="text-nasun-white/50 text-sm">
              {stats?.activeSeason ? "No users yet." : "No active season."}
            </div>
          ) : (
            <div className="space-y-2">
              {stats.topFive.map((user) => (
                <div
                  key={user.rank}
                  className="flex items-center gap-3 py-2 border-b border-nasun-c5/10 last:border-0"
                >
                  <span className="text-lg font-bold text-nasun-white/60 w-6 text-center">
                    {user.rank === 1
                      ? "🥇"
                      : user.rank === 2
                        ? "🥈"
                        : user.rank === 3
                          ? "🥉"
                          : `#${user.rank}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    {user.displayName && (
                      <div className="text-nasun-white text-sm truncate">{user.displayName}</div>
                    )}
                    <div className={`text-nasun-white/50 truncate ${user.displayName ? "text-xs" : "text-sm text-nasun-white"}`}>
                      @{user.originalUsername || user.username}
                    </div>
                  </div>
                  <span className="text-nasun-c3 font-medium shrink-0">{user.userScore.toFixed(3)}</span>
                </div>
              ))}
            </div>
          )}
        </OuterBox>
      </div>

      {/* Active Season Info */}
      {stats?.activeSeason && (
        <OuterBox color="c6" padding="sm" className="w-full !border-nasun-c5/30 !bg-gray-800/30">
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="text-nasun-white/60">Active Season: </span>
              <span className="text-nasun-white font-medium">{stats.activeSeason.name}</span>
              <span className="text-nasun-white/40 ml-2">
                ({stats.activeSeason.startDate} ~ {stats.activeSeason.endDate})
              </span>
            </div>
            <div className="text-nasun-white/60">
              <span className="text-nasun-c3 font-medium">{stats.activeSeason.totalAccounts}</span>{" "}
              users
              {" | "}
              <span className="text-nasun-c3 font-medium">
                {stats.activeSeason.totalPosts}
              </span>{" "}
              posts
            </div>
          </div>
        </OuterBox>
      )}

      {/* Footer */}
      {stats?.calculatedAt && (
        <div className="text-xs text-nasun-white/40 text-right">
          Last updated: {new Date(stats.calculatedAt).toLocaleString()}
        </div>
      )}

      {/* Post Edit Modal */}
      <PostEditModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        post={editingPost}
      />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <OuterBox color="c6" padding="sm" className="!border-nasun-c5/30 !bg-gray-800/30">
      <div className="text-xs uppercase tracking-widest text-nasun-white/50 mb-1">{title}</div>
      <div className="text-2xl font-bold text-nasun-c3">{value}</div>
    </OuterBox>
  );
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
