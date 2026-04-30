/**
 * UjuEcosystemPointsCard Component
 *
 * Dashboard card showing ecosystem points history for UJU Activity.
 * Detached from myAccount dependencies.
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
import { useFilteredTodayScore } from "@/sections/uju/missions/useFilteredTodayScore";
import { useSnapshotHistory } from "@/hooks/useSnapshotHistory";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui";
import { UjuScoreUnavailableFallback } from "../internal/UjuScoreUnavailableFallback";
import {
  getBonusHistory,
  type SnapshotHistoryEntry,
  type BonusHistoryItem,
} from "@/services/ecosystemScoreApi";
import { UjuCard, UjuSectionHeader, UjuButton, UjuStat } from "../../shared";

interface UjuEcosystemPointsCardProps {
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
    <div className="bg-uju-bg border border-uju-border/40 rounded-xl shadow-2xl p-4 min-w-[200px] backdrop-blur-md">
      <p className="font-bold text-uju-primary mb-3 pb-2 border-b border-uju-border/20">{d.date}</p>
      <div className="space-y-2 text-xs font-medium">
        <p className="text-uju-secondary flex justify-between">
          Base Score
          <span className="text-uju-primary font-bold">{d.baseScore}</span>
        </p>
        <p className="text-uju-secondary flex justify-between">
          Multiplier
          <span className="text-pado-2 font-bold">x{d.multiplier.toFixed(1)}</span>
        </p>
        {d.stakingDeltaScaled > 0 && (
          <p className="text-uju-secondary flex justify-between">
            Staking
            <span className="text-pado-4 font-bold">+{d.stakingDeltaScaled.toFixed(0)}</span>
          </p>
        )}
        {d.bonusTotal > 0 && (
          <div className="space-y-1">
            <p className="text-uju-secondary flex justify-between">
              Bonus
              <span className="text-pado-5 font-bold">+{d.bonusTotal}</span>
            </p>
            {d.bonusItems && d.bonusItems.length > 0 && (
              <div className="ml-2 pl-2 border-l border-uju-border/30 space-y-1">
                {d.bonusItems
                  .filter((i) => i.category !== "referral-bonus")
                  .map((item, i) => (
                    <p key={i} className="text-[10px] text-uju-secondary/80 flex justify-between">
                      {BONUS_LABELS[item.category] || item.activityType}
                      <span>+{item.points}</span>
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}
        {d.referralBonus > 0 && (
          <p className="text-uju-secondary flex justify-between">
            Referral (x0.5)
            <span className="text-pado-4 font-bold">+{d.referralBonus}</span>
          </p>
        )}
        <div className="pt-2 border-t border-uju-border/20 mt-2">
          <p className="flex justify-between items-center">
            <span className="text-sm font-bold text-uju-primary">Total Score</span>
            <span className="text-lg font-black text-pado-2">{d.ecosystemScore}</span>
          </p>
          {d.rank != null && (
            <p className="flex justify-between items-center mt-1">
              <span className="text-uju-secondary">Daily Rank</span>
              <span className="font-bold text-blue-400">#{d.rank}</span>
            </p>
          )}
        </div>
        {d.isPenalized && (
          <p className="text-red-400 text-[10px] font-black uppercase tracking-widest text-center pt-1 animate-pulse">
            Penalized
          </p>
        )}
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
    <div className="bg-uju-bg border border-uju-border/40 rounded-xl shadow-2xl p-4 backdrop-blur-md">
      <p className="font-bold text-uju-primary mb-2">{d.date}</p>
      {d.rank != null ? (
        <div className="space-y-1 text-sm font-medium">
          <p className="text-uju-secondary flex items-center justify-between gap-4">
            Daily Rank <span className="font-black text-blue-400 text-base">#{d.rank}</span>
          </p>
          <p className="text-uju-secondary flex items-center justify-between gap-4">
            Total Score <span className="font-bold text-pado-2">{d.ecosystemScore}</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-uju-secondary font-bold italic">Unranked</p>
      )}
    </div>
  );
}

// -- Main Component --

export const UjuEcosystemPointsCard: FC<UjuEcosystemPointsCardProps> = ({
  className = "",
}) => {
  const { user } = useAuth();
  const identityId = user?.identityId;
  const [days, setDays] = useState<DaysOption>(30);

  const { score, isLoading: scoreLoading, isError: scoreError } = useEcosystemScore(identityId);
  const { filtered: filteredScore, hasFilteredOutActivity } = useFilteredTodayScore(score);
  const { data: snapshots, isLoading: historyLoading } = useSnapshotHistory({
    identityId,
    days,
  });

  const { data: bonusHistory } = useQuery({
    queryKey: ["ecosystem", "bonus-history-uju", identityId, days],
    queryFn: () => getBonusHistory(identityId!, days),
    enabled: !!identityId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const isLoading = scoreLoading || historyLoading;

  const chartData = useMemo(() => {
    if (snapshots.length === 0) return [];

    const byDate = new Map<string, SnapshotHistoryEntry>();
    for (const s of snapshots) byDate.set(s.date, s);

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
        isPenalized:
          date < "2026-04-11" ? false : (entry?.isPenalized ?? false),
        bonusItems: bonusByDate.get(date),
      };
    });
  }, [snapshots, bonusHistory]);

  const rankStats = useMemo(() => {
    const ranked = chartData.filter((d) => d.rank != null);
    if (ranked.length === 0) return { best: null, current: null };
    const ranks = ranked.map((d) => d.rank as number);
    return {
      best: Math.min(...ranks),
      current: ranked[ranked.length - 1].rank,
    };
  }, [chartData]);

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

  if (!identityId) {
    return (
      <UjuCard className={className}>
        <UjuSectionHeader
          accent
          title={
            <div className="flex items-center gap-3">
              Ecosystem Points
              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-pado-5/20 text-pado-5 border border-pado-5/20 tracking-widest uppercase">
                Experimental
              </span>
            </div>
          }
        />
        <div className="flex flex-col items-center justify-center py-12 bg-uju-bg/30 rounded-2xl border border-uju-border/10">
          <p className="text-sm font-bold text-uju-secondary uppercase tracking-widest">
            Sign in to view your points history
          </p>
        </div>
      </UjuCard>
    );
  }

  const rangeSelector = (
    <div className="flex items-center gap-1.5 p-1 bg-uju-bg/50 rounded-xl border border-uju-border/20">
      {([7, 14, 30] as DaysOption[]).map((d) => (
        <button
          key={d}
          onClick={() => setDays(d)}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all duration-200 ${
            days === d
              ? "bg-pado-2 text-uju-bg shadow-sm"
              : "text-uju-secondary hover:text-uju-primary"
          }`}
        >
          {d}D
        </button>
      ))}
    </div>
  );

  return (
    <UjuCard variant="accent" className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title={
          <div className="flex items-center gap-3">
            Ecosystem Points
            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-pado-5/20 text-pado-5 border border-pado-5/20 tracking-widest uppercase">
              Experimental
            </span>
          </div>
        }
        subtitle="Tracking your permanent on-chain identity value"
        trailing={rangeSelector}
      />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : scoreError && !score ? (
        <UjuScoreUnavailableFallback />
      ) : (
        <div className="space-y-8">
          {/* Score Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UjuStat
              label={hasFilteredOutActivity ? "Today *" : "Today"}
              value={(filteredScore?.daily.ecosystemScore ?? 0).toLocaleString()}
              tone="mint"
            />
            <UjuStat
              label="This Week"
              value={(score?.weekly.ecosystemScore ?? 0).toLocaleString()}
              tone="cyan"
            />
            <UjuStat
              label="All Time"
              value={(score?.allTime.ecosystemScore ?? 0).toLocaleString()}
              tone="coral"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Score Trend Chart */}
            <div className="space-y-4">
              <h6 className="text-[10px] font-black text-uju-secondary uppercase tracking-[0.2em] px-1">
                Score Trend
              </h6>
              {chartData.length >= 3 ? (
                <div className="h-[200px] p-4 bg-uju-bg/40 rounded-2xl border border-uju-border/10 shadow-inner">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(74, 114, 130, 0.15)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="displayDate"
                        tick={{ fill: "#4A7282", fontSize: 10, fontWeight: 700 }}
                        stroke="rgba(74, 114, 130, 0.2)"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: "#4A7282", fontSize: 10, fontWeight: 700 }}
                        stroke="rgba(74, 114, 130, 0.2)"
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip content={<ScoreTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
                      <Bar
                        dataKey="ecosystemScore"
                        fill="#86f3b7"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center bg-uju-bg/20 rounded-2xl border border-uju-border/5">
                  <p className="text-xs font-bold text-uju-secondary italic">Insufficient data for trend</p>
                </div>
              )}
            </div>

            {/* Rank Chart */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h6 className="text-[10px] font-black text-uju-secondary uppercase tracking-[0.2em]">
                  Ecosystem Rank
                </h6>
                <div className="flex gap-4">
                  {rankStats.best != null && (
                    <span className="text-[10px] font-bold text-uju-secondary uppercase tracking-wider">
                      Best: <span className="text-pado-4">#{rankStats.best}</span>
                    </span>
                  )}
                  {rankStats.current != null && (
                    <span className="text-[10px] font-bold text-uju-secondary uppercase tracking-wider">
                      Now: <span className="text-blue-400">#{rankStats.current}</span>
                    </span>
                  )}
                </div>
              </div>
              {chartData.filter((d) => d.rank != null).length >= 3 ? (
                <div className="h-[200px] p-4 bg-uju-bg/40 rounded-2xl border border-uju-border/10 shadow-inner">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(74, 114, 130, 0.15)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="displayDate"
                        tick={{ fill: "#4A7282", fontSize: 10, fontWeight: 700 }}
                        stroke="rgba(74, 114, 130, 0.2)"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        reversed
                        domain={rankDomain}
                        tick={{ fill: "#4A7282", fontSize: 10, fontWeight: 700 }}
                        stroke="rgba(74, 114, 130, 0.2)"
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip content={<RankTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="rank"
                        stroke="#60a5fa"
                        strokeWidth={3}
                        connectNulls={false}
                        dot={{ fill: "#60a5fa", strokeWidth: 0, r: 4 }}
                        activeDot={{
                          r: 6,
                          fill: "#fff",
                          stroke: "#60a5fa",
                          strokeWidth: 3,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center bg-uju-bg/20 rounded-2xl border border-uju-border/5">
                  <p className="text-xs font-bold text-uju-secondary italic">Insufficient ranking data</p>
                </div>
              )}
            </div>
          </div>

          {/* Daily Log */}
          {dailyLog.length > 0 && (
            <div className="space-y-4">
              <h6 className="text-[10px] font-black text-uju-secondary uppercase tracking-[0.2em] px-1">
                Activity Log
              </h6>
              <div className="space-y-2">
                {dailyLog
                  .filter((entry) => entry.multiplier > 0)
                  .map((entry) => {
                    // Bonus breakdown drops the referral leg — it has its own
                    // pill in the formula and shouldn't double-appear here.
                    const bonusBreakdown =
                      entry.bonusItems?.filter((i) => i.category !== "referral-bonus") ?? [];
                    const showBreakdown = bonusBreakdown.length > 0 || entry.referralBonus > 0;
                    return (
                      <div
                        key={entry.date}
                        className={`rounded-xl px-4 py-3 border transition-all duration-200 ${
                          entry.isPenalized
                            ? "bg-red-500/5 border-red-500/20"
                            : "bg-uju-bg/30 border-uju-border/10 hover:border-uju-border/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          {/* Date */}
                          <span className="text-xs font-black text-uju-primary w-16 shrink-0 tabular-nums">
                            {formatDisplayDate(entry.date)}
                          </span>

                          {/* Formula */}
                          <div className="flex-1 hidden sm:flex items-center gap-2 flex-wrap text-[11px] font-bold">
                            {entry.multiplier === 0 ? (
                              <span className="text-amber-400/60 uppercase tracking-widest">
                                No NFT Activated
                              </span>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-uju-bg/50 border border-uju-border/10">
                                  <span className="text-uju-secondary/60">BASE</span>
                                  <span className="text-uju-primary">{entry.baseScore}</span>
                                </div>
                                <span className="text-uju-secondary/40">×</span>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-pado-2/5 border border-pado-2/20">
                                  <span className="text-pado-2/60">MULT</span>
                                  <span className="text-pado-2">{entry.multiplier.toFixed(1)}</span>
                                </div>
                                {(entry.bonusTotal > 0 || entry.referralBonus > 0) && (
                                  <span className="text-uju-secondary/40">+</span>
                                )}
                                {entry.bonusTotal > 0 && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-pado-5/5 border border-pado-5/20">
                                    <span className="text-pado-5/60">BONUS</span>
                                    <span className="text-pado-5">{entry.bonusTotal}</span>
                                  </div>
                                )}
                                {entry.referralBonus > 0 && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-pado-4/5 border border-pado-4/20">
                                    <span className="text-pado-4/60">REF</span>
                                    <span className="text-pado-4">{(entry.referralBonus * 0.5).toFixed(1)}</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Score & Rank */}
                          <div className="flex items-center gap-6 shrink-0">
                            <span className="text-base font-black text-pado-2 w-16 text-right tabular-nums">
                              {entry.ecosystemScore}
                            </span>
                            <span className="w-20 text-right shrink-0">
                              {entry.rank != null ? (
                                <span className="flex items-center justify-end gap-1.5">
                                  {entry.rankChange && (
                                    <span className={`text-[10px] font-black ${entry.rankChange === 'up' ? 'text-pado-4' : 'text-red-400'}`}>
                                      {entry.rankChange === 'up' ? '▲' : '▼'}
                                    </span>
                                  )}
                                  <span className="text-xs font-black text-uju-primary tabular-nums">#{entry.rank}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-black text-uju-secondary/40 tracking-widest">NONE</span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Detail breakdown row: bonus categories + referral.
                            Indented to align under BASE pill. Hidden on mobile
                            (mirrors the formula row), visible on sm+. */}
                        {showBreakdown && (
                          <div className="hidden sm:flex flex-wrap gap-1.5 mt-2 ml-[64px] text-[10px] font-semibold">
                            {bonusBreakdown.map((item) => (
                              <div
                                key={item.category}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-pado-5/5 border border-pado-5/15 text-pado-5/90"
                              >
                                <span className="text-pado-5/60">
                                  {BONUS_LABELS[item.category] || item.activityType}
                                </span>
                                <span className="tabular-nums">+{item.points}</span>
                              </div>
                            ))}
                            {entry.referralBonus > 0 && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-pado-4/5 border border-pado-4/15 text-pado-4/90">
                                <span className="text-pado-4/60">Referral</span>
                                <span className="tabular-nums">+{entry.referralBonus}</span>
                                <span className="text-pado-4/40">×0.5</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {chartData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 bg-uju-bg/20 rounded-2xl border border-dashed border-uju-border/20">
              <div className="w-12 h-12 rounded-full bg-uju-bg/60 flex items-center justify-center border border-uju-border/10">
                <svg className="w-6 h-6 text-uju-secondary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-uju-secondary uppercase tracking-widest">No snapshot history</p>
                <p className="text-xs font-medium text-uju-secondary/60 mt-1">Points are recorded daily. Check back tomorrow.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </UjuCard>
  );
};

export default UjuEcosystemPointsCard;
