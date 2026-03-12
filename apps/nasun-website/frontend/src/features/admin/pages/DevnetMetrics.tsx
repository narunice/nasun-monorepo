import { useState, useMemo } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageLoading } from "@/components/ui/PageLoading";
import { useDevnetMetrics } from "../hooks/useDevnetMetrics";
import {
  LineChart,
  AreaChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { DevnetMetricEntry } from "../services/devnetMetricsApi";

type DateRange = "7d" | "30d" | "all";

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "All", value: "all" },
];

function filterByRange(metrics: DevnetMetricEntry[], range: DateRange): DevnetMetricEntry[] {
  if (range === "all") return metrics;
  const days = range === "7d" ? 7 : 30;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return metrics.filter((m) => m.date >= cutoffStr);
}

function formatDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-nasun-dark-700/50 border border-nasun-dark-500/30 rounded-lg p-4">
      <p className="text-nasun-white/50 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-nasun-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-nasun-white/40 text-xs mt-1">{sub}</p>}
    </div>
  );
}

const CHART_COLORS = {
  dau: "#3b82f6",
  newAddresses: "#10b981",
  transactions: "#f59e0b",
  cumulative: "#8b5cf6",
};

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#1a1a2e",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#fff",
  },
  labelStyle: { color: "rgba(255,255,255,0.6)" },
};

function MetricChart({
  title,
  data,
  dataKey,
  color,
  type = "line",
}: {
  title: string;
  data: DevnetMetricEntry[];
  dataKey: string;
  color: string;
  type?: "line" | "area";
}) {
  // Filter out entries where value is undefined (for transactionCount)
  const chartData = data.filter((d) => (d as Record<string, unknown>)[dataKey] != null);

  if (chartData.length === 0) {
    return (
      <OuterBox className="p-4">
        <h3 className="text-nasun-white/70 text-sm font-medium mb-4">{title}</h3>
        <div className="h-48 flex items-center justify-center text-nasun-white/30 text-sm">
          No data available
        </div>
      </OuterBox>
    );
  }

  return (
    <OuterBox className="p-4">
      <h3 className="text-nasun-white/70 text-sm font-medium mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        {type === "area" ? (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="rgba(255,255,255,0.2)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} />
            <Tooltip
              labelFormatter={formatDate}
              {...tooltipStyle}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={`url(#grad-${dataKey})`}
              strokeWidth={2}
            />
          </AreaChart>
        ) : (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="rgba(255,255,255,0.2)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} />
            <Tooltip
              labelFormatter={formatDate}
              {...tooltipStyle}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </OuterBox>
  );
}

export function DevnetMetrics() {
  const { data: metrics, isLoading, error } = useDevnetMetrics();
  const [range, setRange] = useState<DateRange>("30d");

  const filtered = useMemo(() => {
    if (!metrics) return [];
    return filterByRange(metrics, range);
  }, [metrics, range]);

  const latest = metrics?.[metrics.length - 1];

  return (
    <AdminLayout>
      <SectionLayout>
        <PageTitle>Devnet Metrics</PageTitle>

        {isLoading && <PageLoading />}
        {error && (
          <div className="text-red-400 text-sm p-4 bg-red-500/10 rounded-lg">
            Failed to load metrics: {error.message}
          </div>
        )}

        {metrics && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard
                label="Daily Active"
                value={latest?.dau ?? 0}
                sub={latest?.date}
              />
              <StatCard
                label="New Addresses"
                value={latest?.newAddresses ?? 0}
                sub={latest?.date}
              />
              <StatCard
                label="Daily TX"
                value={latest?.transactionCount != null ? latest.transactionCount.toLocaleString() : "N/A"}
                sub={latest?.date}
              />
              <StatCard
                label="Total Addresses"
                value={latest?.cumulativeAddresses ?? 0}
                sub={latest?.date}
              />
            </div>

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
                title="Daily Active Addresses (DAU)"
                data={filtered}
                dataKey="dau"
                color={CHART_COLORS.dau}
              />
              <MetricChart
                title="New Addresses"
                data={filtered}
                dataKey="newAddresses"
                color={CHART_COLORS.newAddresses}
              />
              <MetricChart
                title="Daily Transactions"
                data={filtered}
                dataKey="transactionCount"
                color={CHART_COLORS.transactions}
              />
              <MetricChart
                title="Cumulative Unique Addresses"
                data={filtered}
                dataKey="cumulativeAddresses"
                color={CHART_COLORS.cumulative}
                type="area"
              />
            </div>
          </>
        )}
      </SectionLayout>
    </AdminLayout>
  );
}
