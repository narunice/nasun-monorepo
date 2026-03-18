import { useState, useMemo } from "react";
import { PageLoading } from "@/components/ui/PageLoading";
import { useUserAnalytics } from "../../hooks/useUserAnalytics";
import {
  MetricChart,
  filterByDateRange,
  DATE_RANGE_OPTIONS,
  type DateRange,
} from "../charts/MetricChart";

const CHART_COLORS = {
  registeredUsers: "#3b82f6",
  leaderboardAccounts: "#10b981",
  telegramMembers: "#8b5cf6",
  xConnected: "#f59e0b",
};

export function UserAnalyticsTab() {
  const { data: metrics, isLoading, error } = useUserAnalytics();
  const [range, setRange] = useState<DateRange>("30d");

  const filtered = useMemo(() => {
    if (!metrics) return [];
    return filterByDateRange(metrics, range);
  }, [metrics, range]);

  if (isLoading) return <PageLoading />;

  if (error) {
    return (
      <div className="text-red-400 text-sm p-4 bg-red-500/10 rounded-lg">
        Failed to load analytics: {error.message}
      </div>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <div className="text-nasun-white/40 text-center py-12">
        No analytics data available yet. Data will be collected daily.
      </div>
    );
  }

  return (
    <div>
      <p className="text-nasun-white/40 text-xs mb-4">
        Historical data before daily collection started is approximate (based on account creation date).
      </p>

      {/* Date range filter */}
      <div className="flex gap-1 mb-4">
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRange(opt.value)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              range === opt.value
                ? "bg-nasun-brand text-white"
                : "bg-nasun-dark-700/50 text-nasun-white/50 hover:text-nasun-white/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricChart
          title="Registered Users"
          data={filtered}
          dataKey="registeredUsers"
          color={CHART_COLORS.registeredUsers}
          type="area"
        />
        <MetricChart
          title="Leaderboard Accounts"
          data={filtered}
          dataKey="leaderboardAccounts"
          color={CHART_COLORS.leaderboardAccounts}
          type="area"
        />
        <MetricChart
          title="Telegram Members"
          data={filtered}
          dataKey="telegramMembers"
          color={CHART_COLORS.telegramMembers}
        />
        <MetricChart
          title="X Connected"
          data={filtered}
          dataKey="xConnected"
          color={CHART_COLORS.xConnected}
        />
      </div>
    </div>
  );
}
