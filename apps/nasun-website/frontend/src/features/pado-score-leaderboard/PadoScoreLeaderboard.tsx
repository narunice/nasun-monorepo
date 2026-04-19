import React, { useCallback } from "react";
import { GenesisPassBadge } from "@nasun/wallet-ui";
import { DashboardCard } from "../../components/ui/DashboardCard";
import { LeaderboardSearchBox, type LeaderboardSearchResult } from "../../components/ui/LeaderboardSearchBox";
import { useHighlightRow } from "../../hooks/useHighlightRow";
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
const MAX_RANK = 1000;

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

function formatVolume(usd: string): string {
  const n = parseFloat(usd);
  if (isNaN(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function RankCell({ rank }: { rank: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm text-nasun-white">{rank}</span>
      {rank <= 3 && (
        <span className="text-base leading-none">
          {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
        </span>
      )}
    </span>
  );
}

function TraderRow({
  trader,
  highlightedId,
}: {
  trader: ScoreLeaderboardTrader;
  highlightedId: string | null;
}) {
  const isHighlighted = highlightedId === trader.address;
  return (
    <tr
      data-address={trader.address}
      className={`border-b border-pd2/20 transition-colors hover:bg-pd1/25 ${
        isHighlighted ? "bg-nasun-nw2/20 border-l-2 border-nasun-nw1" : ""
      }`}
    >
      <td className="px-4 py-3 font-mono">
        <RankCell rank={trader.rank} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {trader.profileImageUrl ? (
            <img
              src={trader.profileImageUrl}
              alt=""
              className="w-12 h-12 rounded-lg shrink-0 object-cover bg-nasun-dark-500"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg shrink-0 bg-pd1/60" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`text-sm font-medium truncate ${trader.nickname ? "text-nasun-white" : "text-pd3"}`}
              >
                {trader.nickname ?? abbreviateAddress(trader.address)}
              </span>
              {trader.hasGenesisPass && <GenesisPassBadge />}
              {trader.xHandle && (
                <span className="inline-flex items-center justify-center w-4 h-4 bg-sky-500/20 rounded-full flex-shrink-0" title="X (Twitter) connected">
                  <svg className="w-2.5 h-2.5 text-sky-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </span>
              )}
              {trader.hasGoogle && (
                <span className="inline-flex items-center justify-center w-4 h-4 bg-emerald-500/20 rounded-full flex-shrink-0" title="Google connected">
                  <svg className="w-2.5 h-2.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </span>
              )}
              {trader.hasTelegram && (
                <span className="inline-flex items-center justify-center w-4 h-4 bg-violet-500/20 rounded-full flex-shrink-0" title="Telegram member">
                  <svg className="w-2.5 h-2.5 text-violet-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </span>
              )}
            </div>
            {trader.xHandle && (
              <a
                href={`https://x.com/${trader.xHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-pd3 truncate block hover:text-nasun-white/70 transition-colors"
              >
                @{trader.xHandle}
              </a>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right hidden sm:table-cell">
        <span className="text-sm text-pd3">{formatVolume(trader.volumeUsd)}</span>
      </td>
      <td className="px-4 py-3 text-right hidden sm:table-cell">
        <span className="text-sm text-pd3">{trader.tradeCount}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-sm font-bold text-pado-3">
          {trader.totalScore.toLocaleString()}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <RankChangeBadge change={trader.rankChange} />
      </td>
    </tr>
  );
}

function TableHead() {
  return (
    <thead>
      <tr className="border-b border-pd2/30 bg-pd1/10">
        <th className="px-4 py-3 text-left font-medium text-pd3 uppercase tracking-wide">
          Rank
        </th>
        <th className="px-4 py-3 text-left font-medium text-pd3 uppercase tracking-wide">
          Trader
        </th>
        <th className="px-4 py-3 text-right font-medium text-pd3 uppercase tracking-wide hidden sm:table-cell">
          Volume
        </th>
        <th className="px-4 py-3 text-right font-medium text-pd3 uppercase tracking-wide hidden sm:table-cell">
          Trades
        </th>
        <th className="px-4 py-3 text-right font-medium text-pd3 uppercase tracking-wide">
          Score
        </th>
        <th className="px-4 py-3 text-right font-medium text-pd3 uppercase tracking-wide">
          Change
        </th>
      </tr>
    </thead>
  );
}

function LeaderboardTable({
  traders,
  isLoading,
  displayedCount,
  totalParticipants,
  totalPages,
  page,
  setPage,
  highlightedId,
}: {
  traders: ScoreLeaderboardTrader[];
  isLoading: boolean;
  displayedCount: number;
  totalParticipants: number;
  totalPages: number;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  highlightedId: string | null;
}) {
  const offset = (page - 1) * PAGE_SIZE;
  const end = Math.min(offset + PAGE_SIZE, displayedCount);

  return (
    <div className="overflow-x-auto rounded-sm border border-pd2/25 bg-pd1/20">
      <table className="w-full text-sm">
        <TableHead />
        <tbody>
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-pd2/20">
                  <td colSpan={6} className="h-12 animate-pulse bg-pd1/20" />
                </tr>
              ))
            : traders.map((t) => (
                <TraderRow key={t.address} trader={t} highlightedId={highlightedId} />
              ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <span className="text-sm text-pd3">
            Showing {offset + 1}-{end} of top{" "}
            {displayedCount.toLocaleString("en-US")}
            {totalParticipants > 0 && (
              <> (Weekly total participants: {totalParticipants.toLocaleString("en-US")})</>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded-sm border border-pd2/30 text-pd3 hover:text-nasun-white hover:border-pado-1/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="text-sm text-pd3">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm rounded-sm border border-pd2/30 text-pd3 hover:text-nasun-white hover:border-pado-1/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
            <input
              type="number"
              min={1}
              max={totalPages}
              placeholder="Go"
              className="w-14 px-2 py-1.5 text-sm rounded-sm border border-pd2/30 bg-transparent text-pd4 text-center focus:outline-none focus:border-pado-1/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = Math.min(Math.max(1, parseInt(e.currentTarget.value, 10)), totalPages);
                  if (!isNaN(v)) { setPage(v); e.currentTarget.value = ""; }
                }
              }}
            />
          </div>
        </div>
      )}
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
      <div className="mb-3 flex items-center gap-3">
        <span className="text-sm font-medium text-pd3 uppercase tracking-wide">
          Last week final standings
        </span>
        {data?.weekId && (
          <span className="text-sm text-pd3">({data.weekId})</span>
        )}
      </div>
      <div className="overflow-x-auto rounded-sm border border-pd2/25 bg-pd1/20">
        <table className="w-full text-sm">
          <TableHead />
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-pd2/20">
                    <td colSpan={6} className="h-12 animate-pulse bg-pd1/20" />
                  </tr>
                ))
              : traders.map((t) => (
                  <TraderRow key={t.address} trader={t} highlightedId={null} />
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PadoScoreLeaderboard() {
  const currentWeekId = getCurrentWeekId();
  const [page, setPage] = React.useState(1);
  const [viewMode, setViewMode] = React.useState<"current" | "past">("current");
  const [selectedWeekId, setSelectedWeekId] = React.useState(currentWeekId);

  const availableWeeksQuery = useAvailableWeeks();
  const pastWeeks = (availableWeeksQuery.data?.weeks ?? []).filter(
    (w) => w.weekId !== currentWeekId,
  );

  const isCurrentWeek = viewMode === "current";
  const currentQuery = usePadoScoreLeaderboard(selectedWeekId);
  const allTraders = currentQuery.data?.traders ?? [];
  const inGracePeriod = isCurrentWeek && isNewWeekGracePeriod(currentQuery.data);
  const showNoData =
    !isCurrentWeek &&
    !currentQuery.isLoading &&
    allTraders.length === 0;

  const prevQuery = usePreviousPadoScoreLeaderboard(inGracePeriod, PAGE_SIZE, 0);

  const displayedCount = Math.min(allTraders.length, MAX_RANK);
  const totalPages = Math.ceil(displayedCount / PAGE_SIZE);
  const pagedTraders = allTraders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const { highlightedId, selectRow } = useHighlightRow({
    dataAttribute: "data-address",
    pageSize: PAGE_SIZE,
    page,
    setPage,
  });

  const filterFn = useCallback((entry: ScoreLeaderboardTrader, query: string): boolean => {
    const q = query.toLowerCase();
    return (
      entry.address.toLowerCase().includes(q) ||
      (entry.xHandle ?? "").toLowerCase().includes(q) ||
      (entry.nickname ?? "").toLowerCase().includes(q)
    );
  }, []);

  const toResult = useCallback((entry: ScoreLeaderboardTrader): LeaderboardSearchResult => {
    const primary = entry.nickname ?? entry.xHandle ?? abbreviateAddress(entry.address);
    const secondary = entry.xHandle ? `@${entry.xHandle}` : abbreviateAddress(entry.address);
    return {
      id: entry.address,
      primaryLabel: primary,
      secondaryLabel: secondary !== primary ? secondary : undefined,
      rank: entry.rank,
      profileImageUrl: entry.profileImageUrl,
    };
  }, []);

  const handleUserSelect = useCallback((result: LeaderboardSearchResult) => {
    if (result.rank != null) {
      selectRow(result.id, result.rank);
    }
  }, [selectRow]);

  const data = currentQuery.data;

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
              className={`px-3 py-1.5 text-sm transition-colors ${
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
              className={`px-3 py-1.5 text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${
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
              className="text-sm bg-pd1/30 text-pd4 border border-pd2/30 rounded-sm px-2 py-1.5 focus:outline-none focus:border-pado-1/50"
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
        <div className="flex items-center gap-3">
          {data && data.updatedAt > 0 && (
            <span className="text-sm text-pd3 whitespace-nowrap">
              Last Updated{" "}
              {new Date(data.updatedAt).toLocaleString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          )}
          {/* Search box */}
          <LeaderboardSearchBox
            entries={allTraders}
            filterFn={filterFn}
            toResult={toResult}
            onSelect={handleUserSelect}
            placeholder="Search by handle, nickname, or address..."
            disabled={currentQuery.isLoading}
          />
        </div>
      </div>

      {/* Grace period notice */}
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
        <LeaderboardTable
          traders={pagedTraders}
          isLoading={currentQuery.isLoading}
          displayedCount={displayedCount}
          totalParticipants={currentQuery.data?.totalTraders ?? 0}
          totalPages={totalPages}
          page={page}
          setPage={setPage}
          highlightedId={highlightedId}
        />
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
