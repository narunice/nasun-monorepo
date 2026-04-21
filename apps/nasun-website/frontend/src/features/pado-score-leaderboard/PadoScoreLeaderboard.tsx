import React, { useCallback, useState } from "react";
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
const MAX_RANK = 2000;

const failedAvatarUrls = new Set<string>();

function TraderAvatar({ url }: { url: string }) {
  const [failed, setFailed] = useState(() => failedAvatarUrls.has(url));
  if (failed) return <div className="w-12 h-12 rounded-lg shrink-0 bg-pd1/60" />;
  return (
    <img
      src={url}
      alt=""
      className="w-12 h-12 rounded-lg shrink-0 object-cover bg-nasun-dark-500"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      loading="lazy"
      onError={() => { failedAvatarUrls.add(url); setFailed(true); }}
    />
  );
}

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

const CheckIcon = () => (
  <svg className="w-3 h-3 mx-auto" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

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
          {trader.profileImageUrl
            ? <TraderAvatar url={trader.profileImageUrl} />
            : <div className="w-12 h-12 rounded-lg shrink-0 bg-pd1/60" />
          }
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-sm font-medium truncate inline-block max-w-[14ch] md:max-w-[20ch] ${trader.nickname ? "text-nasun-white" : "text-pd3"}`}>
                {trader.nickname ?? abbreviateAddress(trader.address)}
              </span>
              {trader.hasGenesisPass && <GenesisPassBadge />}
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
      <td className="px-2 py-3 text-center w-8">
        {trader.xHandle ? <span className="text-sky-400"><CheckIcon /></span> : null}
      </td>
      <td className="px-2 py-3 text-center w-8">
        {trader.hasGoogle ? <span className="text-emerald-400"><CheckIcon /></span> : null}
      </td>
      <td className="px-2 py-3 text-center w-8">
        {trader.hasTelegram ? <span className="text-violet-400"><CheckIcon /></span> : null}
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
        <th className="px-2 py-3 text-center font-medium text-pd3 w-8" aria-label="Twitter" title="Twitter">
          <svg className="w-3.5 h-3.5 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </th>
        <th className="px-2 py-3 text-center font-medium text-pd3 w-8" aria-label="Google" title="Google">
          <svg className="w-3.5 h-3.5 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        </th>
        <th className="px-2 py-3 text-center font-medium text-pd3 w-8" aria-label="Telegram" title="Telegram">
          <svg className="w-3.5 h-3.5 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.820 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
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

  const btnCls = "px-3 py-1.5 text-sm rounded-sm border border-pd2/30 text-pd3 hover:text-nasun-white hover:border-pado-1/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-sm border border-pd2/25 bg-pd1/20">
        <table className="w-full text-sm">
          <TableHead />
          <tbody>
            {isLoading
              ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-pd3">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-sm">Loading...</span>
                      </div>
                    </td>
                  </tr>
                )
              : traders.map((t) => (
                  <TraderRow key={t.address} trader={t} highlightedId={highlightedId} />
                ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-pd3">
            Showing {offset + 1}-{end} of top{" "}
            {MAX_RANK.toLocaleString("en-US")}
            {totalParticipants > 0 && (
              <> (Weekly total participants: {totalParticipants.toLocaleString("en-US")})</>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(1)} disabled={page === 1} className={btnCls}>
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={btnCls}
            >
              Prev
            </button>
            <span className="text-sm text-pd3">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={btnCls}
            >
              Next
            </button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className={btnCls}>
              Last
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
              ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-pd3">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-sm">Loading...</span>
                      </div>
                    </td>
                  </tr>
                )
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
          totalParticipants={currentQuery.data?.totalParticipants ?? 0}
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
