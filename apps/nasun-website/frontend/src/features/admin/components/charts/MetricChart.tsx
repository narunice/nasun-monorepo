/**
 * Shared MetricChart component for admin analytics pages.
 * Used by DevnetMetrics and UserAnalyticsTab.
 */

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
import { OuterBox } from "@/components/ui/OuterBox";

export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#1a1a2e",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "8px",
    fontSize: "13px",
    color: "#fff",
  },
  labelStyle: { color: "rgba(255,255,255,0.85)" },
};

export function formatChartDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type DateRange = "7d" | "30d" | "90d" | "all";

export const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

export function filterByDateRange<T extends { date: string }>(
  data: T[],
  range: DateRange,
): T[] {
  if (range === "all") return data;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return data.filter((m) => m.date >= cutoffStr);
}

interface MetricChartProps {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  color: string;
  type?: "line" | "area";
}

export function MetricChart({
  title,
  data,
  dataKey,
  color,
  type = "line",
}: MetricChartProps) {
  const chartData = data.filter((d) => d[dataKey] != null);

  if (chartData.length === 0) {
    return (
      <OuterBox className="p-4">
        <h3 className="text-nasun-white text-sm font-medium mb-4">{title}</h3>
        <div className="h-48 flex items-center justify-center text-nasun-white/50 text-sm">
          No data available
        </div>
      </OuterBox>
    );
  }

  return (
    <OuterBox className="p-4">
      <h3 className="text-nasun-white text-sm font-medium mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        {type === "area" ? (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.15)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              stroke="rgba(255,255,255,0.7)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis stroke="rgba(255,255,255,0.7)" fontSize={12} tickLine={false} />
            <Tooltip
              labelFormatter={formatChartDate}
              {...TOOLTIP_STYLE}
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
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.15)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              stroke="rgba(255,255,255,0.7)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis stroke="rgba(255,255,255,0.7)" fontSize={12} tickLine={false} />
            <Tooltip
              labelFormatter={formatChartDate}
              {...TOOLTIP_STYLE}
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
