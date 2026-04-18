import React from 'react';
import { DashboardCard } from '../../components/ui/DashboardCard';
import {
  usePadoScoreLeaderboard,
  usePreviousPadoScoreLeaderboard,
  useAvailableWeeks,
  getCurrentWeekId,
  isNewWeekGracePeriod,
  type ScoreLeaderboardTrader,
  type ScoreLeaderboardResponse,
} from './usePadoScoreLeaderboard';

const PAGE_SIZE = 50;
const MAX_RANK = 500;

function abbreviateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function RankChangeBadge({ change }: { change: number }) {
  if (change > 0) {
    return <span className="text-sm text-emerald-400">+{change}</span>;
  }
  if (change < 0) {
    return <span className="text-sm text-red-400">{change}</span>;
  }
  return <span className="text-sm text-nasun-white/70">-</span>;
}

function TraderRow({ trader }: { trader: ScoreLeaderboardTrader }) {
  const displayName = trader.nickname || abbreviateAddress(trader.address);
  const isNickname = !!trader.nickname;

  return (
    <div className="grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-nasun-nw4/20 hover:bg-nasun-c6/20 transition-colors">
      {/* Rank [2] */}
      <div className="col-span-2 flex items-center gap-1.5">
        <span className="text-sm font-bold text-nasun-white">{trader.rank}</span>
      </div>

      {/* Trader [6] */}
      <div className="col-span-6 flex items-center gap-2 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm font-medium truncate ${isNickname ? 'text-nasun-white' : 'text-nasun-white/70'}`}>
              {displayName}
            </span>
            {trader.hasGenesisPass && (
              <span className="shrink-0 text-sm font-bold text-nasun-c1 leading-none" title="Genesis Pass">
                GP
              </span>
            )}
          </div>
          {isNickname && (
            <div className="text-sm text-nasun-white/70 truncate">
              {abbreviateAddress(trader.address)}
            </div>
          )}
        </div>
      </div>

      {/* Score [2] */}
      <div className="col-span-2 text-right">
        <span className="text-sm font-bold text-nasun-c3">{trader.totalScore.toLocaleString()}</span>
      </div>

      {/* Trades [1] */}
      <div className="col-span-1 text-right hidden sm:block">
        <span className="text-sm text-nasun-white/70">{trader.tradeCount}</span>
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
    <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-nasun-nw4/30">
      <div className="col-span-2 text-sm font-medium text-nasun-white/70 uppercase tracking-wide">Rank</div>
      <div className="col-span-6 text-sm font-medium text-nasun-white/70 uppercase tracking-wide">Trader</div>
      <div className="col-span-2 text-right text-sm font-medium text-nasun-white/70 uppercase tracking-wide">Score</div>
      <div className="col-span-1 text-right text-sm font-medium text-nasun-white/70 uppercase tracking-wide hidden sm:block">Trades</div>
      <div className="col-span-1 text-right text-sm font-medium text-nasun-white/70 uppercase tracking-wide">+/-</div>
    </div>
  );
}

function WeekBadge({ weekId, weekStart }: { weekId?: string; weekStart?: number }) {
  const label = weekId ?? 'Current Week';
  const resetDate = weekStart ? new Date(weekStart).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }) : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-nasun-c5/20 border border-nasun-c5/40 text-sm font-medium text-nasun-c7">
        {label}
      </span>
      {resetDate && (
        <span className="text-sm text-nasun-white/70">Reset: {resetDate}</span>
      )}
    </div>
  );
}

function PrevWeekSection({ data, isLoading }: { data: ScoreLeaderboardResponse | undefined; isLoading: boolean }) {
  const traders = data?.traders ?? [];

  if (!isLoading && traders.length === 0) return null;

  return (
    <div className="mt-6">
      <DashboardCard>
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm font-medium text-nasun-white/70 uppercase tracking-wide">
            Last week final standings
          </span>
          {data?.weekId && (
            <span className="text-sm text-nasun-white/70">({data.weekId})</span>
          )}
        </div>
        <TableHeader />
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 border-b border-nasun-nw4/20 animate-pulse bg-nasun-c6/10" />
            ))
          : traders.map((t) => <TraderRow key={t.address} trader={t} />)
        }
      </DashboardCard>
    </div>
  );
}

export function PadoScoreLeaderboard() {
  const currentWeekId = getCurrentWeekId();
  const [page, setPage] = React.useState(1);
  const [selectedWeekId, setSelectedWeekId] = React.useState(currentWeekId);
  const offset = (page - 1) * PAGE_SIZE;

  const availableWeeksQuery = useAvailableWeeks();
  const isCurrentWeek = selectedWeekId === currentWeekId;
  const currentQuery = usePadoScoreLeaderboard(selectedWeekId, PAGE_SIZE, offset);
  const inGracePeriod = isCurrentWeek && isNewWeekGracePeriod(currentQuery.data);
  const showNoData = !isCurrentWeek && !currentQuery.isLoading && (currentQuery.data?.traders.length ?? 0) === 0;
  const prevQuery = usePreviousPadoScoreLeaderboard(inGracePeriod, PAGE_SIZE, 0);

  const data = currentQuery.data;
  const totalTraders = data?.totalTraders ?? 0;
  const totalPages = Math.min(Math.ceil(totalTraders / PAGE_SIZE), Math.ceil(MAX_RANK / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <WeekBadge weekId={data?.weekId} weekStart={data?.weekStart} />
          {(availableWeeksQuery.data?.weeks.length ?? 0) > 0 && (
            <select
              value={selectedWeekId}
              onChange={(e) => { setSelectedWeekId(e.target.value); setPage(1); }}
              className="text-sm bg-nasun-c6/20 text-nasun-white/80 border border-nasun-nw4/30 rounded-sm px-2 py-1 focus:outline-none focus:border-nasun-c5/50"
            >
              {(availableWeeksQuery.data!.weeks.some(w => w.weekId === currentWeekId)
                ? availableWeeksQuery.data!.weeks
                : [{ weekId: currentWeekId, label: currentWeekId }, ...availableWeeksQuery.data!.weeks]
              ).map((w) => (
                <option key={w.weekId} value={w.weekId}>
                  {w.weekId === currentWeekId ? `This Week (${w.weekId.split('-')[1]})` : w.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {data && data.updatedAt > 0 && (
          <span className="text-sm text-nasun-white/70">
            Updated {new Date(data.updatedAt).toLocaleString('en-US', {
              hour: '2-digit', minute: '2-digit', hour12: false,
            })}
          </span>
        )}
      </div>

      {/* Grace period notice + previous week */}
      {inGracePeriod && (
        <DashboardCard>
          <p className="text-sm font-medium text-nasun-white">
            Week just started. Leaderboard updates as traders are active.
          </p>
          <p className="text-sm text-nasun-white/70 mt-1">
            New scores will appear within the next 12 hours.
          </p>
        </DashboardCard>
      )}

      {/* Past week with no data */}
      {showNoData && (
        <DashboardCard>
          <p className="text-sm text-nasun-white/70 py-4 text-center">No data for this week.</p>
        </DashboardCard>
      )}

      {/* Current week table (hidden during grace period or when no data) */}
      {!inGracePeriod && !showNoData && (
        <DashboardCard>
          <TableHeader />
          {currentQuery.isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-12 border-b border-nasun-nw4/20 animate-pulse bg-nasun-c6/10" />
              ))
            : (data?.traders ?? []).map((t) => <TraderRow key={t.address} trader={t} />)
          }

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 px-4 py-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm rounded-sm border border-nasun-nw4/30 text-nasun-white/70 hover:text-nasun-white hover:border-nasun-c5/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-sm text-nasun-white/70">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm rounded-sm border border-nasun-nw4/30 text-nasun-white/70 hover:text-nasun-white hover:border-nasun-c5/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </DashboardCard>
      )}

      {/* Previous week snapshot (shown during grace period) */}
      {inGracePeriod && (
        <PrevWeekSection data={prevQuery.data} isLoading={prevQuery.isLoading} />
      )}
    </div>
  );
}
