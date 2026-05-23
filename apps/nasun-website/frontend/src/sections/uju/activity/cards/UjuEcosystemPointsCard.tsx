/**
 * UjuEcosystemPointsCard Component
 *
 * Dashboard card showing ecosystem points history for UJU Activity.
 * Detached from myAccount dependencies.
 */

import { FC, Fragment, useMemo, useState } from "react";
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
  getBaseHistory,
  type SnapshotHistoryEntry,
  type BonusHistoryItem,
  type BaseHistoryItem,
} from "@/services/ecosystemScoreApi";
import { APP_MISSION_MAP } from "@/sections/uju/missions/missionRegistry";
import { UjuCard, UjuSectionHeader, UjuStat } from "../../shared";

// Lookup: activity_points.category → user-facing label. Mission ids map 1:1
// to categories (e.g. 'pado-dex', 'gostop-crash'); a few system categories
// (governance, mint actions) aren't in the mission registry, so add explicit
// entries for them. Anything not found falls back to a humanized id.
const BASE_CATEGORY_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {
    governance: "Governance Vote",
    "alliance-mint": "Alliance Mint",
    "genesis-pass-mint": "Genesis Pass Mint",
    "battalion-mint": "Battalion Mint",
  };
  for (const missions of Object.values(APP_MISSION_MAP)) {
    for (const m of missions) map[m.id] = m.label;
  }
  return map;
})();

function humanizeCategory(category: string): string {
  return category
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function labelForBaseCategory(category: string): string {
  return BASE_CATEGORY_LABELS[category] ?? humanizeCategory(category);
}

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

const CATEGORY_COLORS: Record<string, string> = {
  base: "bg-yellow-500",
  governance: "bg-purple-500",
  "referral-bonus": "bg-sky-500",
  "ecosystem-bonus-earlybird": "bg-violet-500",
  "ecosystem-bonus-pado": "bg-lime-500",
  "ecosystem-bonus-leaderboard": "bg-pado-3",
  "ecosystem-bonus-game": "bg-orange-500",
  "ecosystem-bonus-airdrop": "bg-fuchsia-500",
  "ecosystem-bonus-bugreport": "bg-rose-500",
  "ecosystem-bonus-feedback": "bg-pink-500",
  "ecosystem-bonus-creators-appreciation": "bg-indigo-500",
  "ecosystem-bonus-creator-posts": "bg-emerald-500",
  "ecosystem-bonus-admin": "bg-teal-500",
  "ecosystem-bonus-genesis-pass-airdrop": "bg-sky-500",
  "ecosystem-bonus-alliance-airdrop": "bg-blue-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  base: "Base Score",
  governance: "Governance",
  "referral-bonus": "Referral",
  "ecosystem-bonus-earlybird": "Early Bird",
  "ecosystem-bonus-pado": "Pado Leaderboard",
  "ecosystem-bonus-leaderboard": "Ecosystem Leaderboard",
  "ecosystem-bonus-game": "Game Reward",
  "ecosystem-bonus-airdrop": "Airdrop",
  "ecosystem-bonus-bugreport": "Bug Report",
  "ecosystem-bonus-feedback": "Feedback",
  "ecosystem-bonus-creators-appreciation": "Creators Appreciation",
  "ecosystem-bonus-creator-posts": "Creator Posts",
  "ecosystem-bonus-admin": "Bonus",
  "ecosystem-bonus-genesis-pass-airdrop": "Genesis Pass Airdrop",
  "ecosystem-bonus-alliance-airdrop": "Alliance Airdrop",
};

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
  baseItems?: BaseHistoryItem[];
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
      <p className="font-normal text-uju-primary mb-2  border-uju-border/20">
        {d.date}
      </p>
      <div className="space-y-1.5 pb-2 mb-2 border-b border-uju-border/20 text-sm font-light">
        <p className="flex justify-between items-center">
          <span className="font-normal text-uju-primary">Total Points</span>
          <span className="text-lg font-semibold text-pado-2">
            {d.ecosystemScore}
          </span>
        </p>
      </div>
      <div className="space-y-1.5  font-light">
        <p className="text-sm text-uju-secondary flex justify-between">
          Base Score
          <span className="text-sm text-uju-primary font-normal">
            {d.baseScore}
          </span>
        </p>
        {d.stakingDeltaScaled > 0 && d.multiplier > 0 && (
          <p className="text-sm text-uju-secondary flex justify-between">
            Staking
            <span className="text-sm text-pado-4 font-normal">
              +{Math.round(d.stakingDeltaScaled / d.multiplier)}
            </span>
          </p>
        )}
        <p className="text-sm text-uju-secondary flex justify-between">
          Multiplier
          <span className="text-sm text-pado-2 font-normal">
            x{d.multiplier.toFixed(1)}
          </span>
        </p>
        {d.bonusTotal > 0 && (
          <div className="space-y-1">
            <p className="text-uju-secondary flex justify-between">
              Bonus
              <span className="text-pado-5 font-normal">+{d.bonusTotal}</span>
            </p>
            {d.bonusItems && d.bonusItems.length > 0 && (
              <div className="ml-2 pl-2 border-l border-uju-border/30 space-y-1">
                {d.bonusItems
                  .filter((i) => i.category !== "referral-bonus")
                  .map((item, i) => (
                    <p
                      key={i}
                      className="text-xs text-uju-secondary flex justify-between"
                    >
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
            <span className="text-pado-4 font-normal">+{d.referralBonus}</span>
          </p>
        )}
        {d.isPenalized && (
          <p className="text-red-400 text-xs font-semibold uppercase tracking-widest text-center pt-1 animate-pulse">
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
      <p className="font-normal text-uju-primary mb-2">{d.date}</p>
      {d.rank != null ? (
        <div className="space-y-1 text-sm font-light">
          <p className="text-uju-secondary flex items-center justify-between gap-4">
            Daily Rank{" "}
            <span className="font-semibold text-pado-lavender text-base">
              #{d.rank}
            </span>
          </p>
          <p className="text-uju-secondary flex items-center justify-between gap-4">
            Total Points{" "}
            <span className="font-normal text-pado-2">{d.ecosystemScore}</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-uju-secondary font-normal italic">
          Unranked
        </p>
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
  const [days, setDays] = useState<DaysOption>(7);

  const {
    score,
    isLoading: scoreLoading,
    isError: scoreError,
    refresh,
    isRefreshing,
    cooldownSeconds,
  } = useEcosystemScore(identityId);
  const {
    filtered: filteredScore,
    hasFilteredOutActivity,
    completedMissions,
  } = useFilteredTodayScore(score);
  const { data: snapshots, isLoading: historyLoading } = useSnapshotHistory({
    identityId,
    days,
  });

  const { data: bonusHistory, isLoading: bonusLoading } = useQuery({
    queryKey: ["ecosystem", "bonus-history-uju", identityId, days],
    queryFn: () => getBonusHistory(identityId!, days),
    enabled: !!identityId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const cognitoToken = user?.cognitoToken;
  // isLoading (not isPending) so a disabled query (e.g. wallet-login user
  // without cognitoToken) doesn't trap the card in a permanent spinner.
  const { data: baseHistory, isLoading: baseLoading } = useQuery({
    queryKey: ["ecosystem", "base-history-uju", identityId, days],
    queryFn: () => getBaseHistory(identityId!, days, cognitoToken),
    enabled: !!identityId && !!cognitoToken,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const isLoading = scoreLoading || historyLoading || bonusLoading || baseLoading;

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

    const baseByDate = new Map<string, BaseHistoryItem[]>();
    if (baseHistory) {
      for (const day of baseHistory) {
        baseByDate.set(day.date, day.items);
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
        baseItems: baseByDate.get(date),
      };
    });
  }, [snapshots, bonusHistory, baseHistory]);

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

  const allTimeBarSegments = useMemo(() => {
    const breakdown = score?.allTime.scoreBreakdown ?? [];
    return breakdown.filter((c) => c.points > 0);
  }, [score]);
  const allTimeBarTotal = useMemo(
    () => allTimeBarSegments.reduce((s, c) => s + c.points, 0),
    [allTimeBarSegments],
  );

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
        <UjuSectionHeader accent title="Nasun Points Breakdown" />
        <div className="flex flex-col items-center justify-center py-12 bg-uju-bg/50 rounded-2xl border border-uju-border/10">
          <p className="text-sm font-normal text-uju-secondary uppercase tracking-widest">
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
          className={`px-2.5 py-1 text-sm font-normal rounded-lg transition-all duration-200 ${
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
          <div className="flex items-center gap-3">Nasun Points Breakdown</div>
        }
        subtitle="Your daily points earned from missions and activities."
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
          <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-uju-border/40">
            <div className="px-4 py-2 sm:py-0">
              <UjuStat
                label={hasFilteredOutActivity ? "Today *" : "Today"}
                value={(
                  filteredScore?.daily.ecosystemScore ?? 0
                ).toLocaleString()}
                tone="aqua"
                align="center"
              />
            </div>
            <div className="px-4 py-2 sm:py-0">
              <UjuStat
                label="This Week"
                value={(score?.weekly.ecosystemScore ?? 0).toLocaleString()}
                tone="mint"
                align="center"
              />
            </div>
            <div className="px-4 py-2 sm:py-0">
              <UjuStat
                label="All Time"
                value={(score?.allTime.ecosystemScore ?? 0).toLocaleString()}
                tone="pado-gradient"
                align="center"
              />
            </div>
          </div>

          {/* Today breakdown formula + All-time breakdown (combined card) */}
          {(() => {
            const todayBase = filteredScore?.daily.baseScore ?? 0;
            const todayStaking = filteredScore?.daily.stakingScore ?? 0;
            const todayMultiplier = filteredScore?.multiplier ?? 0;
            const todayPts = filteredScore?.daily.ecosystemScore ?? 0;
            const todayBonus = Math.max(
              0,
              todayPts -
                Math.round((todayBase + todayStaking) * todayMultiplier),
            );
            const showAllTimeBreakdown =
              allTimeBarSegments.length > 0 && allTimeBarTotal > 0;
            return (
              <div className="rounded-xl bg-pado-2/5 border border-uju-border/50 p-3 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h6 className="text-sm font-semibold text-uju-primary uppercase tracking-[0.2em]">
                      Today breakdown
                    </h6>
                    <button
                      type="button"
                      onClick={refresh}
                      disabled={isRefreshing || cooldownSeconds > 0}
                      title={
                        isRefreshing
                          ? "Refreshing..."
                          : cooldownSeconds > 0
                            ? `Refresh in ${cooldownSeconds}s`
                            : "Refresh"
                      }
                      aria-label={
                        isRefreshing
                          ? "Refreshing"
                          : cooldownSeconds > 0
                            ? `Refresh available in ${cooldownSeconds} seconds`
                            : "Refresh"
                      }
                      className="shrink-0 flex items-center justify-center text-uju-secondary hover:text-pado-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      >
                        <path d="M21 12a9 9 0 1 1-3-6.7" />
                        <path d="M21 4v5h-5" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 flex items-baseline flex-wrap gap-x-1.5 gap-y-1 text-sm text-uju-secondary">
                      <span className="font-mono text-amber-400 tabular-nums text-base">
                        {todayPts.toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        })}
                      </span>
                      <span
                        className="text-uju-secondary"
                        title={
                          hasFilteredOutActivity
                            ? "Today reflects only activities for your active engagement selections. All-time is the full ledger."
                            : undefined
                        }
                      >
                        pts today{hasFilteredOutActivity ? " *" : ""}
                      </span>
                      <span>=</span>
                      {(() => {
                        // Parens when staking is present (formula clarity: (base+staking)×mult)
                        // or when multiple mission pills need grouping.
                        const needsParens =
                          todayStaking > 0 || completedMissions.length > 1;
                        const baseContent =
                          completedMissions.length === 0 ? (
                            <>
                              <span className="font-mono text-uju-primary tabular-nums">
                                {todayBase}
                              </span>
                              <span>base</span>
                            </>
                          ) : (
                            completedMissions.map((m, i) => (
                              <Fragment key={m.id}>
                                {i > 0 && <span>+</span>}
                                <span className="font-mono text-uju-primary tabular-nums">
                                  {m.pts}
                                </span>
                                <span className="text-uju-primary/70">
                                  {m.label}
                                </span>
                              </Fragment>
                            ))
                          );
                        return (
                          <>
                            {needsParens && <span>(</span>}
                            {baseContent}
                            {todayStaking > 0 && (
                              <>
                                <span>+</span>
                                <span
                                  className="font-mono text-pado-4 tabular-nums"
                                  title="Active stake tier: 1~500 NSN = 1pt, 501~5,000 = 2pt, 5,001+ = 3pt. Updates within ~24h of delegation."
                                >
                                  {todayStaking}
                                </span>
                                <span>staking</span>
                              </>
                            )}
                            {needsParens && <span>)</span>}
                          </>
                        );
                      })()}
                      <span>×</span>
                      <span
                        className={`font-mono tabular-nums ${score?.isPenalized ? "text-red-400" : "text-pado-2"}`}
                      >
                        {todayMultiplier.toFixed(1)}x
                      </span>
                      <span>mult</span>
                      {score?.isPenalized && (
                        <span className="text-red-400/70">(penalized)</span>
                      )}
                      <span>+</span>
                      <span className="font-mono text-pado-5 tabular-nums">
                        {todayBonus}
                      </span>
                      <span>bonus</span>
                    </div>
                  </div>
                </div>

                {showAllTimeBreakdown && (
                  <div className="border-t border-uju-border/40 pt-3 space-y-2">
                    <h6 className="text-sm font-semibold text-uju-primary uppercase tracking-[0.2em] px-1">
                      All-time breakdown
                    </h6>
                    <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
                      {allTimeBarSegments.map((seg) => {
                        const pct = (seg.points / allTimeBarTotal) * 100;
                        if (pct < 1) return null;
                        return (
                          <div
                            key={seg.category}
                            className={`${CATEGORY_COLORS[seg.category] || "bg-gray-400"} transition-all`}
                            style={{ width: `${pct}%` }}
                            title={`${CATEGORY_LABELS[seg.category] || seg.category}: ${seg.points.toLocaleString("en-US")} pts`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {allTimeBarSegments.map((seg) => (
                        <span
                          key={seg.category}
                          className="flex items-center gap-1.5 text-sm font-light text-uju-secondary"
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[seg.category] || "bg-gray-400"}`}
                          />
                          {CATEGORY_LABELS[seg.category] || seg.category}
                          <span className="text-uju-primary tabular-nums font-semibold">
                            {seg.points.toLocaleString("en-US")}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Point Trend Chart */}
            <div className="space-y-4">
              <h6 className="text-sm font-semibold text-uju-primary uppercase tracking-[0.2em] px-1">
                Point Trend
              </h6>
              {chartData.length >= 3 ? (
                <div className="h-[200px] p-4 bg-uju-card rounded-2xl border border-uju-border/50 shadow-inner">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(74, 114, 130, 0.15)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="displayDate"
                        tick={{
                          fill: "#D4E4EA",
                          fontSize: 14,
                          fontWeight: 300,
                        }}
                        stroke="rgba(212, 228, 234, 0.4)"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{
                          fill: "#D4E4EA",
                          fontSize: 14,
                          fontWeight: 300,
                        }}
                        stroke="rgba(212, 228, 234, 0.4)"
                        tickLine={false}
                        axisLine={false}
                        width={56}
                      />
                      <Tooltip
                        content={<ScoreTooltip />}
                        cursor={{ fill: "rgba(59, 130, 246, 0.05)" }}
                      />
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
                <div className="h-[200px] flex items-center justify-center bg-uju-card rounded-2xl border border-uju-border/50">
                  <p className="text-sm font-normal text-uju-secondary italic">
                    Insufficient data for trend
                  </p>
                </div>
              )}
            </div>

            {/* Rank Chart */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h6 className="text-sm font-semibold text-uju-primary uppercase tracking-[0.2em]">
                  Points Rank
                </h6>
                <div className="flex gap-4">
                  {rankStats.best != null && (
                    <span className="text-sm font-normal text-uju-secondary uppercase tracking-wider">
                      Best:{" "}
                      <span className="text-pado-4">#{rankStats.best}</span>
                    </span>
                  )}
                  {rankStats.current != null && (
                    <span className="text-sm font-normal text-uju-secondary uppercase tracking-wider">
                      Now:{" "}
                      <span className="text-pado-lavender">
                        #{rankStats.current}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              {chartData.filter((d) => d.rank != null).length >= 3 ? (
                <div className="h-[200px] p-4 bg-uju-card rounded-2xl border border-uju-border/50 shadow-inner">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(74, 114, 130, 0.15)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="displayDate"
                        tick={{
                          fill: "#D4E4EA",
                          fontSize: 14,
                          fontWeight: 300,
                        }}
                        stroke="rgba(212, 228, 234, 0.4)"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        reversed
                        domain={rankDomain}
                        tick={{
                          fill: "#D4E4EA",
                          fontSize: 14,
                          fontWeight: 300,
                        }}
                        stroke="rgba(212, 228, 234, 0.4)"
                        tickLine={false}
                        axisLine={false}
                        width={56}
                      />
                      <Tooltip content={<RankTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="rank"
                        stroke="#C9A7FF"
                        strokeWidth={1.5}
                        connectNulls={false}
                        dot={{ fill: "#C9A7FF", strokeWidth: 0, r: 3 }}
                        activeDot={{
                          r: 5,
                          fill: "#fff",
                          stroke: "#C9A7FF",
                          strokeWidth: 1.5,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center bg-uju-card rounded-2xl border border-uju-border/50">
                  <p className="text-sm font-normal text-uju-secondary italic">
                    Insufficient ranking data
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Daily Log */}
          {dailyLog.length > 0 && (
            <div className="space-y-4">
              <h6 className="text-sm font-semibold text-uju-primary uppercase tracking-[0.2em] px-1">
                Activity Log
              </h6>
              <div className="space-y-2">
                {dailyLog
                  .filter((entry) => entry.multiplier > 0)
                  .map((entry) => {
                    // Bonus breakdown drops the referral leg — it has its own
                    // pill in the formula and shouldn't double-appear here.
                    const bonusBreakdown =
                      entry.bonusItems?.filter(
                        (i) => i.category !== "referral-bonus",
                      ) ?? [];
                    const showBreakdown =
                      bonusBreakdown.length > 0 || entry.referralBonus > 0;
                    return (
                      <div
                        key={entry.date}
                        className={`rounded-xl px-4 py-3 border transition-all duration-200 ${
                          entry.isPenalized
                            ? "bg-red-500/5 border-red-500/40"
                            : "bg-uju-bg/50 border-uju-border/50 hover:border-uju-border/70"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          {/* Date */}
                          <span className="text-base font-semibold text-uju-primary w-16 shrink-0 tabular-nums">
                            {formatDisplayDate(entry.date)}
                          </span>

                          {/* Formula — labels are intentionally one notch
                              smaller than the surrounding row so the score and
                              rank columns dominate at a glance. */}
                          <div className="flex-1 hidden sm:flex items-center gap-2 flex-wrap text-sm font-normal">
                            {entry.multiplier === 0 ? (
                              <span className="text-amber-400/80 uppercase tracking-widest">
                                No NFT Activated
                              </span>
                            ) : (
                              <>
                                {(entry.stakingDeltaScaled ?? 0) > 0 && (
                                  <span className="text-uju-secondary">(</span>
                                )}
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-uju-bg border border-uju-border/10">
                                  <span className="text-uju-secondary text-xs uppercase tracking-wider">
                                    Base
                                  </span>
                                  <span className="text-uju-primary tabular-nums">
                                    {entry.baseScore}
                                  </span>
                                </div>
                                {(entry.stakingDeltaScaled ?? 0) > 0 &&
                                  entry.multiplier > 0 && (
                                    <>
                                      <span className="text-uju-secondary">
                                        +
                                      </span>
                                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-pado-4/5 border border-pado-4/20">
                                        <span className="text-pado-4/80 text-xs uppercase tracking-wider">
                                          Staking
                                        </span>
                                        <span className="text-pado-4 tabular-nums">
                                          {Math.round(
                                            (entry.stakingDeltaScaled ?? 0) /
                                              entry.multiplier,
                                          )}
                                        </span>
                                      </div>
                                      <span className="text-uju-secondary">
                                        )
                                      </span>
                                    </>
                                  )}
                                <span className="text-uju-secondary">×</span>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-pado-2/5 border border-pado-2/20">
                                  <span className="text-pado-2/80 text-xs uppercase tracking-wider">
                                    Mult
                                  </span>
                                  <span className="text-pado-2 tabular-nums">
                                    {entry.multiplier.toFixed(1)}
                                  </span>
                                </div>
                                {(entry.bonusTotal > 0 ||
                                  entry.referralBonus > 0) && (
                                  <span className="text-uju-secondary">+</span>
                                )}
                                {entry.bonusTotal > 0 && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-pado-5/5 border border-pado-5/20">
                                    <span className="text-pado-5/80 text-xs uppercase tracking-wider">
                                      Bonus
                                    </span>
                                    <span className="text-pado-5 tabular-nums">
                                      {entry.bonusTotal}
                                    </span>
                                  </div>
                                )}
                                {entry.referralBonus > 0 && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-pado-4/5 border border-pado-4/20">
                                    <span className="text-pado-4/80 text-xs uppercase tracking-wider">
                                      Ref
                                    </span>
                                    <span className="text-pado-4 tabular-nums">
                                      {(entry.referralBonus * 0.5).toFixed(1)}
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Score & Rank */}
                          <div className="flex items-center gap-6 shrink-0">
                            <span className="text-base font-semibold text-pado-2 w-16 text-right tabular-nums">
                              {entry.ecosystemScore}
                            </span>
                            <span className="w-20 text-right shrink-0">
                              {entry.rank != null ? (
                                <span className="flex items-center justify-end gap-1.5">
                                  {entry.rankChange && (
                                    <span
                                      className={`text-sm font-semibold ${entry.rankChange === "up" ? "text-pado-4" : "text-red-400"}`}
                                    >
                                      {entry.rankChange === "up" ? "▲" : "▼"}
                                    </span>
                                  )}
                                  <span className="text-sm font-semibold text-uju-primary tabular-nums">
                                    #{entry.rank}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-sm font-semibold text-uju-secondary tracking-widest">
                                  NONE
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Detail breakdown row. Mirrors the live "Today
                            breakdown" composition: chips list which exact
                            activities composed the day's base, plus bonus
                            categories. Generic text explainers (e.g.
                            staking-tier rules) are omitted here — those
                            belong in the formula tooltip, not the per-day log. */}
                        {(() => {
                          const baseItems = entry.baseItems ?? [];
                          const hasBaseDetail =
                            baseItems.length > 0 || entry.baseScore > 0;
                          const hasAnyDetail = hasBaseDetail || showBreakdown;
                          if (!hasAnyDetail) return null;
                          return (
                            <div className="flex flex-col gap-1.5 mt-2 sm:ml-[64px] text-xs font-normal">
                              {hasBaseDetail && (
                                <div className="flex flex-wrap items-center gap-1.5 leading-snug">
                                  <span className="uppercase tracking-wider shrink-0 text-uju-secondary">
                                    Base
                                  </span>
                                  {baseItems.length > 0 ? (
                                    baseItems.map((item) => (
                                      <span
                                        key={item.category}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-uju-bg border border-uju-border/30 text-uju-primary"
                                      >
                                        <span>
                                          {labelForBaseCategory(item.category)}
                                        </span>
                                        <span className="tabular-nums text-uju-secondary">
                                          +{item.points}
                                        </span>
                                      </span>
                                    ))
                                  ) : (
                                    // Fallback when /ecosystem/base-history is
                                    // unavailable (e.g. before that endpoint
                                    // ships) or returns no rows for this day:
                                    // show the day's aggregate base as a
                                    // single chip so the row still has signal.
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-uju-bg border border-uju-border/30 text-uju-primary">
                                      <span>Base</span>
                                      <span className="tabular-nums text-uju-secondary">
                                        +{entry.baseScore}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              )}
                              {showBreakdown && (
                                <div className="flex flex-wrap items-center gap-1.5 leading-snug">
                                  <span className="uppercase tracking-wider shrink-0 text-pado-5/80">
                                    Bonus
                                  </span>
                                  {bonusBreakdown.map((item) => (
                                    <span
                                      key={item.category}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-pd1/30 border border-pd2/40 text-pd4"
                                    >
                                      <span>
                                        {BONUS_LABELS[item.category] ||
                                          item.activityType}
                                      </span>
                                      <span className="tabular-nums">
                                        +{item.points}
                                      </span>
                                    </span>
                                  ))}
                                  {entry.referralBonus > 0 && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-pd1/30 border border-pd2/40 text-pd4">
                                      <span>Referral</span>
                                      <span className="tabular-nums">
                                        +{entry.referralBonus}
                                      </span>
                                      <span>×0.5</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {chartData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 bg-uju-bg rounded-2xl border border-dashed border-uju-border/20">
              <div className="w-12 h-12 rounded-full bg-uju-bg flex items-center justify-center border border-uju-border/10">
                <svg
                  className="w-6 h-6 text-uju-secondary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-normal text-uju-secondary uppercase tracking-widest">
                  No snapshot history
                </p>
                <p className="text-sm font-light text-uju-secondary mt-1">
                  Points are recorded daily. Check back tomorrow.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </UjuCard>
  );
};

export default UjuEcosystemPointsCard;
