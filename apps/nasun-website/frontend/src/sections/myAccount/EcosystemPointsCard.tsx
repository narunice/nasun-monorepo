/**
 * EcosystemPointsCard
 *
 * Dashboard card showing ecosystem points history:
 * - Score overview (Today / Weekly / All Time)
 * - Score trend bar chart with formula breakdown tooltip
 * - Ecosystem rank line chart (inverted Y-axis)
 * - Daily log with score formula breakdown
 */

import { FC, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { useSnapshotHistory } from "@/hooks/useSnapshotHistory";
import { useFilteredTodayScore } from "@/sections/uju/missions/useFilteredTodayScore";
import { useQuery } from "@tanstack/react-query";
import { OuterBox, Spinner } from "@/components/ui";
import { ScoreUnavailableFallback } from "@/sections/myAccount/components/ScoreUnavailableFallback";
import {
  getBonusHistory,
  type SnapshotHistoryEntry,
  type BonusHistoryItem,
} from "@/services/ecosystemScoreApi";

interface EcosystemPointsCardProps {
  className?: string;
}

type DaysOption = 7 | 14 | 30;

// -- Helpers --

function formatDisplayDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (cur <= last) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

const BONUS_LABELS: Record<string, string> = {
  "ecosystem-bonus-earlybird": "Early Bird",
  "ecosystem-bonus-pado": "Pado Leaderboard",
  "ecosystem-bonus-leaderboard": "Ecosystem Leaderboard",
  "ecosystem-bonus-game": "Game Reward",
  "ecosystem-bonus-airdrop": "Airdrop",
  "ecosystem-bonus-bugreport": "Bug Report",
  "ecosystem-bonus-feedback": "Feedback",
  "ecosystem-bonus-creators-appreciation": "Creators Appreciation",
  "ecosystem-bonus-creator-posts": "Creator Posts",
  "referral-bonus": "Referral",
  "ecosystem-bonus-admin": "Bonus",
  "ecosystem-bonus-genesis-pass-airdrop": "Genesis Pass Airdrop",
  "ecosystem-bonus-alliance-airdrop": "Alliance Airdrop",
};

// -- Chart data type --

interface ChartPoint {
  date: string;
  displayDate: string;
  ecosystemScore: number;
  baseScore: number;
  multiplier: number;
  bonusTotal: number;
  referralBonus: number;
  stakingDeltaScaled: number;
  rank: number | null;
  isPenalized: boolean;
  bonusItems?: BonusHistoryItem[];
}

// -- Tooltip components --

function ScoreTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-950 border border-gray-700/70 rounded-sm shadow-lg p-3 min-w-[180px]">
      <p className="font-semibold text-nasun-white mb-2">{d.date}</p>
      <div className="space-y-1 text-sm">
        <p className="text-gray-300">
          Base:{" "}
          <span className="text-nasun-white font-medium">{d.baseScore}</span>
          <span className="text-gray-300"> x </span>
          <span className="text-nasun-white font-medium">
            {d.multiplier.toFixed(1)}
          </span>
          <span className="text-gray-300"> = </span>
          <span className="text-nasun-white font-medium">
            {(d.baseScore * d.multiplier).toFixed(0)}
          </span>
        </p>
        {d.stakingDeltaScaled > 0 && (
          <p className="text-gray-300">
            Staking:{" "}
            <span className="text-emerald-400 font-medium">
              +{d.stakingDeltaScaled.toFixed(0)}
            </span>
          </p>
        )}
        {d.bonusTotal > 0 && (
          <div className="text-gray-300">
            <span>
              Bonus:{" "}
              <span className="text-amber-400 font-medium">
                +{d.bonusTotal}
              </span>
            </span>
            {d.bonusItems && d.bonusItems.length > 0 && (
              <div className="ml-2 mt-0.5 space-y-0.5">
                {d.bonusItems
                  .filter((i) => i.category !== "referral-bonus")
                  .map((item, i) => (
                    <p key={i} className="text-gray-300">
                      {BONUS_LABELS[item.category] || item.activityType}:{" "}
                      <span className="text-amber-400/80">+{item.points}</span>
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}
        {d.referralBonus > 0 && (
          <p className="text-gray-300">
            Referral:{" "}
            <span className="text-emerald-400 font-medium">
              +{d.referralBonus}
            </span>
            <span className="text-gray-300 text-sm ml-1">(x0.5)</span>
          </p>
        )}
        <p className="text-gray-300 border-t border-gray-700/50 pt-1 mt-1">
          Total:{" "}
          <span className="font-bold text-nasun-c3">{d.ecosystemScore}</span>
          {d.rank != null && (
            <span className="text-gray-300 ml-2">#{d.rank}</span>
          )}
        </p>
        {d.isPenalized && <p className="text-amber-400 text-sm">Penalized</p>}
      </div>
    </div>
  );
}

function RankTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-950 border border-gray-700/70 rounded-sm shadow-lg p-3">
      <p className="font-semibold text-nasun-white mb-1">{d.date}</p>
      {d.rank != null ? (
        <div className="space-y-1 text-sm">
          <p className="text-gray-300">
            Rank: <span className="font-bold text-blue-400">#{d.rank}</span>
          </p>
          <p className="text-gray-300">
            Score: <span className="text-nasun-white">{d.baseScore}</span>
            <span className="text-gray-300"> x {d.multiplier.toFixed(1)}</span>
            {d.bonusTotal > 0 && (
              <span className="text-amber-400"> +{d.bonusTotal}</span>
            )}
            {d.referralBonus > 0 && (
              <span className="text-emerald-400">
                {" "}
                +{(d.referralBonus * 0.5).toFixed(1)}
              </span>
            )}
            <span className="text-gray-300"> = </span>
            <span className="font-bold text-nasun-c3">{d.ecosystemScore}</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-300">Unranked</p>
      )}
    </div>
  );
}

// -- Main Component --

export const EcosystemPointsCard: FC<EcosystemPointsCardProps> = ({
  className = "",
}) => {
  const { user } = useAuth();
  const identityId = user?.identityId;
  const [days, setDays] = useState<DaysOption>(30);

  const { score, isLoading: scoreLoading, isError: scoreError } = useEcosystemScore(identityId);
  const { filtered: filteredScore } = useFilteredTodayScore(score);
  const { data: snapshots, isLoading: historyLoading } = useSnapshotHistory({
    identityId,
    days,
  });

  const { data: bonusHistory } = useQuery({
    queryKey: ["ecosystem", "bonus-history", identityId, days],
    queryFn: () => getBonusHistory(identityId!, days),
    enabled: !!identityId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const isLoading = scoreLoading || historyLoading;

  // Prepare chart data with gap-filling and bonus breakdown
  const chartData = useMemo(() => {
    if (snapshots.length === 0) return [];

    const byDate = new Map<string, SnapshotHistoryEntry>();
    for (const s of snapshots) byDate.set(s.date, s);

    // Build bonus items lookup by date
    const bonusByDate = new Map<string, BonusHistoryItem[]>();
    if (bonusHistory) {
      for (const day of bonusHistory) {
        bonusByDate.set(day.date, day.items);
      }
    }

    const firstDate = snapshots[0].date;
    const lastDate = snapshots[snapshots.length - 1].date;
    const allDates = generateDateRange(firstDate, lastDate);

    return allDates.map((date): ChartPoint => {
      const entry = byDate.get(date);
      return {
        date,
        displayDate: formatDisplayDate(date),
        ecosystemScore: entry?.ecosystemScore ?? 0,
        baseScore: entry?.baseScore ?? 0,
        multiplier: entry?.multiplier ?? 0,
        bonusTotal: entry?.bonusTotal ?? 0,
        referralBonus: entry?.referralBonus ?? 0,
        stakingDeltaScaled: entry?.stakingDeltaScaled ?? 0,
        rank: entry?.rank ?? null,
        // Grace period: suppress penalty display before enforcement date
        isPenalized:
          date < "2026-04-11" ? false : (entry?.isPenalized ?? false),
        bonusItems: bonusByDate.get(date),
      };
    });
  }, [snapshots, bonusHistory]);

  // Rank stats
  const rankStats = useMemo(() => {
    const ranked = chartData.filter((d) => d.rank != null);
    if (ranked.length === 0) return { best: null, current: null };
    const ranks = ranked.map((d) => d.rank as number);
    return {
      best: Math.min(...ranks),
      current: ranked[ranked.length - 1].rank,
    };
  }, [chartData]);

  // Rank Y-axis domain
  const rankDomain = useMemo(() => {
    const ranked = chartData
      .filter((d) => d.rank != null)
      .map((d) => d.rank as number);
    if (ranked.length === 0) return [1, 100];
    const min = Math.min(...ranked);
    const max = Math.max(...ranked);
    const pad = Math.max(1, Math.ceil((max - min) * 0.1));
    return [Math.max(1, min - pad), max + pad];
  }, [chartData]);

  // Daily log (last 7 entries, reverse chronological)
  const dailyLog = useMemo(() => {
    const recent = [...chartData].reverse().slice(0, 7);
    return recent.map((entry, i) => {
      const prev = recent[i + 1];
      let rankChange: "up" | "down" | null = null;
      if (entry.rank != null && prev?.rank != null) {
        if (entry.rank < prev.rank) rankChange = "up";
        else if (entry.rank > prev.rank) rankChange = "down";
      }
      return { ...entry, rankChange };
    });
  }, [chartData]);

  // Not authenticated
  if (!identityId) {
    return (
      <OuterBox color="w2" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4 flex items-center gap-2">
          Nasun Ecosystem Points
          <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">
            Experimental
          </span>
        </h5>
        <p className="text-sm text-nasun-white/80 text-center py-8">
          Sign in to view your ecosystem points history
        </p>
      </OuterBox>
    );
  }

  return (
    <OuterBox color="w2" padding="sm" className={className}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h5 className="font-medium uppercase text-nasun-white flex items-center gap-2">
          Nasun Ecosystem Points
          <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">
            Experimental
          </span>
        </h5>
        <div className="flex gap-1">
          {([7, 14, 30] as DaysOption[]).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded-sm text-sm font-medium transition-colors ${
                days === d
                  ? "bg-nasun-c3/20 text-nasun-c3"
                  : "text-nasun-white/80 hover:text-nasun-white/80"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner />
        </div>
      ) : scoreError && !score ? (
        <ScoreUnavailableFallback />
      ) : (
        <>
          {/* Score Overview */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div className="rounded-sm bg-teal-800 border border-teal-700 p-3 text-center">
              <p className="text-sm text-nasun-white">Today</p>
              <p className="text-lg font-bold text-emerald-200">
                {(filteredScore?.daily.ecosystemScore ?? 0).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
            <div className="rounded-sm bg-teal-800 border border-teal-700 p-3 text-center">
              <p className="text-sm text-nasun-white">This Week</p>
              <p className="text-lg font-bold text-emerald-200">
                {(score?.weekly.ecosystemScore ?? 0).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
            <div className="rounded-sm bg-teal-800 border border-teal-700 p-3 text-center">
              <p className="text-sm text-nasun-white">All Time</p>
              <p className="text-lg font-bold text-emerald-200">
                {(score?.allTime.ecosystemScore ?? 0).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
          </div>

          {/* Score Trend Chart (only show when 3+ days of data) */}
          {chartData.length >= 3 && (
            <div className="mb-5">
              <p className="text-sm text-nasun-white/80 uppercase tracking-wide mb-3">
                Score Trend
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                  style={{ background: "transparent" }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(59, 130, 246, 0.08)"
                  />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    stroke="rgba(59, 130, 246, 0.35)"
                    tickLine={false}
                    axisLine={true}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    stroke="rgba(59, 130, 246, 0.35)"
                    tickLine={false}
                    axisLine={true}
                    width={35}
                  />
                  <Tooltip content={<ScoreTooltip />} />
                  <Bar
                    dataKey="ecosystemScore"
                    fill="rgb(52, 211, 153)"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Ecosystem Rank Chart (only show when 3+ ranked days) */}
          {chartData.filter((d) => d.rank != null).length >= 3 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-nasun-white/80 uppercase tracking-wide">
                  Ecosystem Rank
                </p>
                <div className="flex gap-4 text-sm">
                  {rankStats.best != null && (
                    <span className="text-nasun-white/80">
                      Best:{" "}
                      <span className="font-bold text-emerald-400">
                        #{rankStats.best}
                      </span>
                    </span>
                  )}
                  {rankStats.current != null && (
                    <span className="text-nasun-white/80">
                      Current:{" "}
                      <span className="font-bold text-blue-400">
                        #{rankStats.current}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(59, 130, 246, 0.08)"
                  />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    stroke="rgba(59, 130, 246, 0.35)"
                    tickLine={false}
                    axisLine={true}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    reversed
                    domain={rankDomain}
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    stroke="rgba(59, 130, 246, 0.35)"
                    tickLine={false}
                    axisLine={true}
                    width={35}
                  />
                  <Tooltip content={<RankTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="rank"
                    stroke="rgb(96, 165, 250)"
                    strokeWidth={2}
                    connectNulls={false}
                    dot={{ fill: "rgb(96, 165, 250)", strokeWidth: 0, r: 3 }}
                    activeDot={{
                      r: 5,
                      fill: "rgb(255, 255, 255)",
                      stroke: "rgb(96, 165, 250)",
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Daily Log with formula breakdown */}
          {dailyLog.length > 0 && (
            <div>
              <p className="text-sm text-nasun-white/80 uppercase tracking-wide mb-3">
                Daily Log
              </p>
              <div className="space-y-1">
                {dailyLog
                  .filter((entry) => entry.multiplier > 0)
                  .map((entry) => (
                    <div
                      key={entry.date}
                      className={`flex items-center justify-between rounded-sm px-3 py-2 text-sm ${
                        entry.isPenalized
                          ? "bg-amber-500/5 border border-amber-500/15"
                          : "bg-slate-700/30 border border-transparent"
                      }`}
                    >
                      {/* Date */}
                      <span className="text-nasun-white/80 w-16 shrink-0">
                        {formatDisplayDate(entry.date)}
                      </span>

                      {/* Formula: (base x mult) + bonus = total */}
                      <span className="text-nasun-white/80 hidden sm:flex items-center gap-1 flex-wrap">
                        {entry.multiplier === 0 ? (
                          <span className="text-amber-400/60">
                            No NFT activated
                          </span>
                        ) : (
                          <>
                            <span className="text-nasun-white/70">
                              {entry.baseScore}
                            </span>
                            <span>x</span>
                            <span className="text-nasun-white/70">
                              {entry.multiplier.toFixed(1)}
                            </span>
                            {entry.bonusTotal > 0 && (
                              <>
                                <span>+</span>
                                <span
                                  className="text-amber-400"
                                  title={
                                    entry.bonusItems
                                      ?.filter(
                                        (i) => i.category !== "referral-bonus",
                                      )
                                      .map(
                                        (i) =>
                                          `${BONUS_LABELS[i.category] || i.activityType}: +${i.points}`,
                                      )
                                      .join("\n") ||
                                    `Bonus: +${entry.bonusTotal}`
                                  }
                                >
                                  {entry.bonusTotal}
                                </span>
                              </>
                            )}
                            {entry.referralBonus > 0 && (
                              <>
                                <span>+</span>
                                <span
                                  className="text-emerald-400"
                                  title={`Referral: +${entry.referralBonus} (x0.5)`}
                                >
                                  {(entry.referralBonus * 0.5).toFixed(1)}
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </span>

                      {/* Score */}
                      <span className="font-bold text-nasun-c3 w-14 text-right">
                        {entry.ecosystemScore}
                      </span>

                      {/* Rank */}
                      <span className="w-16 text-right shrink-0">
                        {entry.rank != null ? (
                          <span className="text-nasun-white/80">
                            {entry.rankChange === "up" && (
                              <span className="text-emerald-400 !text-base mr-1">
                                ⇧
                              </span>
                            )}
                            {entry.rankChange === "down" && (
                              <span className="text-red-400 !text-base mr-1">
                                ⇩
                              </span>
                            )}
                            #{entry.rank}
                          </span>
                        ) : (
                          <span className="text-nasun-white/80">--</span>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {chartData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <p className="text-sm text-nasun-white/80">
                No snapshot history yet
              </p>
              <p className="text-sm text-nasun-white/80">
                Points are recorded daily. Check back tomorrow.
              </p>
            </div>
          )}
        </>
      )}
    </OuterBox>
  );
};
