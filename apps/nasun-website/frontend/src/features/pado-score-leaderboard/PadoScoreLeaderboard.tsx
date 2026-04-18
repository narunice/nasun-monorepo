import React from "react";
import { DashboardCard } from "../../components/ui/DashboardCard";
import {
  usePadoScoreLeaderboard,
  usePreviousPadoScoreLeaderboard,
  useAvailableWeeks,
  getCurrentWeekId,
  isNewWeekGracePeriod,
  type ScoreLeaderboardTrader,
  type ScoreLeaderboardResponse,
} from "./usePadoScoreLeaderboard";

const PAGE_SIZE = 50;
const MAX_RANK = 500;

function abbreviateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function RankChangeBadge({ change }: { change: number }) {
  if (change > 0) {
    return <span className="text-sm text-pado-4">+{change}</span>;
  }
  if (change < 0) {
    return <span className="text-sm text-red-400">{change}</span>;
  }
  return <span className="text-sm text-pd3">-</span>;
}

function TraderRow({ trader }: { trader: ScoreLeaderboardTrader }) {
  const displayName = trader.nickname || abbreviateAddress(trader.address);
  const isNickname = !!trader.nickname;

  return (
    <div className="grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-pd2/25 hover:bg-pd1/20 transition-colors">
      {/* Rank [2] */}
      <div className="col-span-2 flex items-center gap-1.5">
        <span className="text-sm font-bold text-nasun-white">
          {trader.rank}
        </span>
      </div>

      {/* Trader [6] */}
      <div className="col-span-6 flex items-center gap-2 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-sm font-medium truncate ${isNickname ? "text-nasun-white" : "text-pd3"}`}
            >
              {displayName}
            </span>
            {trader.hasGenesisPass && (
              <span
                className="shrink-0 text-sm font-bold text-pado-4 leading-none"
                title="Genesis Pass"
              >
                GP
              </span>
            )}
          </div>
          {isNickname && (
            <div className="text-sm text-pd3 truncate">
              {abbreviateAddress(trader.address)}
            </div>
          )}
        </div>
      </div>

      {/* Score [2] */}
      <div className="col-span-2 text-right">
        <span className="text-sm font-bold text-pado-3">
          {trader.totalScore.toLocaleString()}
        </span>
      </div>

      {/* Trades [1] */}
      <div className="col-span-1 text-right hidden sm:block">
        <span className="text-sm text-pd3">{trader.tradeCount}</span>
      </div>

      {/* Rank change [1] */}
      <div className="col-span-1 text-right">
        <RankChangeBadge change={trader.rankChange} />
      </div>
    </div>
  );
}

function TableHeader() {
  return (
    <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-pd2/30">
      <div className="col-span-2 text-sm font-medium text-pd3 uppercase tracking-wide">
        Rank
      </div>
      <div className="col-span-6 text-sm font-medium text-pd3 uppercase tracking-wide">
        Trader
      </div>
      <div className="col-span-2 text-right text-sm font-medium text-pd3 uppercase tracking-wide">
        Score
      </div>
      <div className="col-span-1 text-right text-sm font-medium text-pd3 uppercase tracking-wide hidden sm:block">
        Trades
      </div>
      <div className="col-span-1 text-right text-sm font-medium text-pd3 uppercase tracking-wide">
        +/-
      </div>
    </div>
  );
}

function PrevWeekSection({
  data,
  isLoading,
}: {
  data: ScoreLeaderboardResponse | undefined;
  isLoading: boolean;
}) {
  const traders = data?.traders ?? [];

  if (!isLoading && traders.length === 0) return null;

  return (
    <div className="mt-6">
      <DashboardCard className="!bg-pd1/20 !border-pd2/30 hover:!border-pado-1/40">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm font-medium text-pd3 uppercase tracking-wide">
            Last week final standings
          </span>
          {data?.weekId && (
            <span className="text-sm text-pd3">({data.weekId})</span>
          )}
        </div>
        <TableHeader />
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 border-b border-pd2/25 animate-pulse bg-pd1/20"
              />
            ))
          : traders.map((t) => <TraderRow key={t.address} trader={t} />)}
      </DashboardCard>
    </div>
  );
}

export function PadoScoreLeaderboard() {
  const currentWeekId = getCurrentWeekId();
  const [page, setPage] = React.useState(1);
  const [viewMode, setViewMode] = React.useState<"current" | "past">("current");
  const [selectedWeekId, setSelectedWeekId] = React.useState(currentWeekId);
  const offset = (page - 1) * PAGE_SIZE;

  const availableWeeksQuery = useAvailableWeeks();
  const pastWeeks = (availableWeeksQuery.data?.weeks ?? []).filter(
    (w) => w.weekId !== currentWeekId,
  );

  const isCurrentWeek = viewMode === "current";
  const currentQuery = usePadoScoreLeaderboard(
    selectedWeekId,
    PAGE_SIZE,
    offset,
  );
  const inGracePeriod =
    isCurrentWeek && isNewWeekGracePeriod(currentQuery.data);
  const showNoData =
    !isCurrentWeek &&
    !currentQuery.isLoading &&
    (currentQuery.data?.traders.length ?? 0) === 0;
  const prevQuery = usePreviousPadoScoreLeaderboard(
    inGracePeriod,
    PAGE_SIZE,
    0,
  );

  const data = currentQuery.data;
  const totalTraders = data?.totalTraders ?? 0;
  const totalPages = Math.min(
    Math.ceil(totalTraders / PAGE_SIZE),
    Math.ceil(MAX_RANK / PAGE_SIZE),
  );

  const handleViewModeChange = (mode: "current" | "past") => {
    setViewMode(mode);
    setPage(1);
    if (mode === "current") {
      setSelectedWeekId(currentWeekId);
    } else if (pastWeeks.length > 0) {
      setSelectedWeekId(pastWeeks[0].weekId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center rounded-sm border border-pd2/30 overflow-hidden">
            <button
              onClick={() => handleViewModeChange("current")}
              className={`px-3 py-1 text-sm transition-colors ${
                viewMode === "current"
                  ? "bg-pado-1/30 text-pado-2 font-medium"
                  : "text-pd3 hover:text-nasun-white"
              }`}
            >
              Current Week
            </button>
            <button
              onClick={() => handleViewModeChange("past")}
              disabled={pastWeeks.length === 0}
              className={`px-3 py-1 text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${
                viewMode === "past"
                  ? "bg-pado-1/30 text-pado-2 font-medium"
                  : "text-pd3 hover:text-nasun-white"
              }`}
            >
              Past Weeks
            </button>
          </div>
          {/* Past week selector */}
          {viewMode === "past" && pastWeeks.length > 0 && (
            <select
              value={selectedWeekId}
              onChange={(e) => {
                setSelectedWeekId(e.target.value);
                setPage(1);
              }}
              className="text-sm bg-pd1/30 text-pd4 border border-pd2/30 rounded-sm px-2 py-1 focus:outline-none focus:border-pado-1/50"
            >
              {pastWeeks.map((w) => (
                <option key={w.weekId} value={w.weekId}>
                  {w.label}
                </option>
              ))}
            </select>
          )}
          {/* Current week reset info */}
          {viewMode === "current" && data?.weekStart && (
            <span className="text-sm text-pd3">
              Resets{" "}
              {new Date(
                data.weekStart + 7 * 24 * 60 * 60 * 1000,
              ).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </span>
          )}
        </div>
        {data && data.updatedAt > 0 && (
          <span className="text-sm text-pd3">
            Updated{" "}
            {new Date(data.updatedAt).toLocaleString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </span>
        )}
      </div>

      {/* Grace period notice + previous week */}
      {inGracePeriod && (
        <DashboardCard className="!bg-pd1/20 !border-pd2/30 hover:!border-pado-1/40">
          <p className="text-sm font-medium text-nasun-white">
            Week just started. Leaderboard updates as traders are active.
          </p>
          <p className="text-sm text-pd3 mt-1">
            New scores will appear within the next 12 hours.
          </p>
        </DashboardCard>
      )}

      {/* Past week with no data */}
      {showNoData && (
        <DashboardCard className="!bg-pd1/20 !border-pd2/30 hover:!border-pado-1/40">
          <p className="text-sm text-pd3 py-4 text-center">
            No data for this week.
          </p>
        </DashboardCard>
      )}

      {/* Current week table (hidden during grace period or when no data) */}
      {!inGracePeriod && !showNoData && (
        <DashboardCard className="!bg-pd1/20 !border-pd2/30 hover:!border-pado-1/40">
          <TableHeader />
          {currentQuery.isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 border-b border-nasun-nw4/20 animate-pulse bg-nasun-c6/10"
                />
              ))
            : (data?.traders ?? []).map((t) => (
                <TraderRow key={t.address} trader={t} />
              ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 px-4 py-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm rounded-sm border border-pd2/30 text-pd3 hover:text-nasun-white hover:border-pado-1/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-sm text-pd3">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm rounded-sm border border-pd2/30 text-pd3 hover:text-nasun-white hover:border-pado-1/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </DashboardCard>
      )}

      {/* Previous week snapshot (shown during grace period) */}
      {inGracePeriod && (
        <PrevWeekSection
          data={prevQuery.data}
          isLoading={prevQuery.isLoading}
        />
      )}
    </div>
  );
}
