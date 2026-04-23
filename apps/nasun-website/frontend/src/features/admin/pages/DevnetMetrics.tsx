import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageLoading } from "@/components/ui/PageLoading";
import { useDevnetMetrics } from "../hooks/useDevnetMetrics";
import { useAdminAuth } from "../hooks/useAdminAuth";
import {
  fetchNasunStatsMeta,
  downloadNasunStats,
} from "../services/devnetMetricsApi";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { StatCard } from "../components/StatCard";
import {
  MetricChart,
  TOOLTIP_STYLE,
  formatChartDate,
  filterByDateRange,
  DATE_RANGE_OPTIONS,
  type DateRange,
} from "../components/charts/MetricChart";

const CHART_COLORS = {
  dau: "#3b82f6",
  newAddresses: "#10b981",
  transactions: "#f59e0b",
  cumulative: "#8b5cf6",
};

// Devnet launched 2026-03-05. Earlier rows are internal dev-period test data.
const LAUNCH_DATE = "2026-03-05";

export function DevnetMetrics() {
  const { data: rawMetrics, isLoading, error } = useDevnetMetrics();
  const [range, setRange] = useState<DateRange>("30d");
  const { cognitoToken } = useAdminAuth();
  const [downloading, setDownloading] = useState<"csv" | "txt" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const nasunMeta = useQuery({
    queryKey: ["nasun-stats-meta"],
    queryFn: () => fetchNasunStatsMeta(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!downloadError) return;
    const t = setTimeout(() => setDownloadError(null), 6000);
    return () => clearTimeout(t);
  }, [downloadError]);

  async function onDownload(format: "csv" | "txt") {
    if (!cognitoToken) return;
    setDownloading(format);
    setDownloadError(null);
    try {
      await downloadNasunStats(cognitoToken, format);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  const metrics = useMemo(
    () => rawMetrics?.filter(m => m.date >= LAUNCH_DATE),
    [rawMetrics]
  );

  const filtered = useMemo(() => {
    if (!metrics) return [];
    return filterByDateRange(metrics, range);
  }, [metrics, range]);

  const latest = metrics?.[metrics.length - 1];

  const repeatWallets = (latest?.dau ?? 0) - (latest?.newAddresses ?? 0);
  const repeatRatio = latest?.dau ? Math.round((repeatWallets / latest.dau) * 100) : 0;

  const chartDataWithRepeat = useMemo(() =>
    filtered.map(m => ({
      ...m,
      repeatWallets: Math.max(0, m.dau - m.newAddresses),
    })),
    [filtered]
  );

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
            <div className="text-xs text-nasun-white/60 mb-3 leading-relaxed">
              Scope: wallets with meaningful on-chain engagement (DEX, scratchcard, lottery, transfer, staking, governance).
              Excluded to avoid bot-farming and airdrop inflation: faucet claims, passive/airdrop point grants, off-chain chat, daily-mission entries.
              DAU = distinct wallets active that day. "New" = wallets whose first-ever qualifying activity was that day. "Repeat" = DAU minus New.
              Data from 2026-03-05 (launch). Daily transaction count uses sui-indexer checkpoints from 2026-04-14 onward.
            </div>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard
                label="Daily Active"
                value={latest?.dau ?? 0}
                sub={`${repeatRatio}% repeat (${repeatWallets})`}
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
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    range === opt.value
                      ? "bg-nasun-brand text-white"
                      : "bg-nasun-dark-700/50 text-nasun-white/70 hover:text-nasun-white/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OuterBox className="p-4">
                <h3 className="text-nasun-white text-sm font-medium mb-4">Daily Active Addresses (DAU)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartDataWithRepeat}>
                    <defs>
                      <linearGradient id="grad-dau-main" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.dau} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.dau} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.15)" />
                    <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="rgba(255,255,255,0.7)" fontSize={12} tickLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.7)" fontSize={12} tickLine={false} />
                    <Tooltip
                      labelFormatter={(v) => formatChartDate(String(v))}
                      {...TOOLTIP_STYLE}
                      formatter={((_v: unknown, name: string | undefined, props: { payload: { dau: number; repeatWallets: number } }) => {
                        if (name !== "dau") return [String(_v), name ?? ""];
                        const { dau, repeatWallets } = props.payload;
                        const pct = dau ? Math.round((repeatWallets / dau) * 100) : 0;
                        return [`${dau.toLocaleString()}  (${pct}% repeat, ${repeatWallets.toLocaleString()} returning)`, "DAU"];
                      }) as never}
                    />
                    <Area type="monotone" dataKey="dau" stroke={CHART_COLORS.dau} fill="url(#grad-dau-main)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </OuterBox>
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

            {/* DAU Breakdown: New vs Repeat */}
            {chartDataWithRepeat.length > 0 && (
              <OuterBox className="p-4 mt-4">
                <h3 className="text-nasun-white text-sm font-medium mb-4">DAU Breakdown: New vs Repeat</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartDataWithRepeat}>
                    <defs>
                      <linearGradient id="grad-newAddr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.newAddresses} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={CHART_COLORS.newAddresses} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="grad-repeat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.dau} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={CHART_COLORS.dau} stopOpacity={0} />
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
                    <Legend
                      wrapperStyle={{ fontSize: "12px", color: "rgba(255,255,255,0.85)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="newAddresses"
                      name="New"
                      stackId="1"
                      stroke={CHART_COLORS.newAddresses}
                      fill="url(#grad-newAddr)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="repeatWallets"
                      name="Repeat"
                      stackId="1"
                      stroke={CHART_COLORS.dau}
                      fill="url(#grad-repeat)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </OuterBox>
            )}

            {/* Nasun Stats full report download */}
            <OuterBox className="p-4 mt-6">
              <h3 className="text-nasun-white text-sm font-medium mb-2">
                Detailed Nasun Stats
              </h3>
              <p className="text-xs text-nasun-white/60 mb-3 leading-relaxed">
                Full report: DAU by social (X/Google/Telegram), verified traders/gamers,
                mission distribution, category breakdown, top activities. Regenerated daily
                around 01:00 UTC.
                {nasunMeta.data?.ready && nasunMeta.data.generatedAt && (
                  <>
                    {" "}
                    Last generated:{" "}
                    <span className="text-nasun-white/80">
                      {new Date(nasunMeta.data.generatedAt).toLocaleString("en-US")}
                    </span>
                    {" "}(report base: {nasunMeta.data.reportBaseDate},{" "}
                    {nasunMeta.data.rowCount} rows).
                  </>
                )}
                {nasunMeta.data && !nasunMeta.data.ready && (
                  <span className="text-yellow-300/80"> Not yet generated.</span>
                )}
              </p>
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => onDownload("csv")}
                  disabled={!cognitoToken || downloading !== null || !nasunMeta.data?.ready}
                  className="px-3 py-1.5 text-sm rounded-md bg-nasun-brand/80 hover:bg-nasun-brand text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {downloading === "csv" ? "Downloading…" : "Download CSV"}
                </button>
                <button
                  type="button"
                  onClick={() => onDownload("txt")}
                  disabled={!cognitoToken || downloading !== null || !nasunMeta.data?.ready}
                  className="px-3 py-1.5 text-sm rounded-md bg-nasun-dark-700/60 hover:bg-nasun-dark-700/80 text-nasun-white/90 border border-nasun-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {downloading === "txt" ? "Downloading…" : "Download TXT (snapshot)"}
                </button>
              </div>
              {downloadError && (
                <div className="mt-2 text-xs text-red-400">{downloadError}</div>
              )}
            </OuterBox>
          </>
        )}
      </SectionLayout>
    </AdminLayout>
  );
}
