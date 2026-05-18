/**
 * LeaderboardPage — Tier 0 PR-4.
 *
 * Surfaces GET /api/gostop/leaderboard with period/game/metric filters.
 * Backend already excludes opt-out/delayed players, masks anonymous players
 * (~xxxx via salted hash), and caches 10s. /me row highlight uses the
 * connected wallet (no extra request — match by `row.player === wallet`).
 */

import { useEffect, useState } from "react";
import { useLeaderboard } from "../lib/api/queries";
import type {
  LeaderboardGame,
  LeaderboardMetric,
  LeaderboardPeriod,
  LeaderboardRow,
} from "../lib/api/types";
import { useGostopAuth } from "../hooks/useGostopAuth";
import { ENABLE_CRASH } from "../lib/gostop-config";
import {
  fmtTimeAgo,
  fmtUsdc,
  fmtUsdcSigned,
} from "../features/dashboard/format";
import { PlayerIdentity } from "../features/shared/PlayerIdentity";
import { Pagination } from "../features/shared/Pagination";

const PERIOD_OPTIONS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "all", label: "All time" },
];

const METRIC_OPTIONS: { value: LeaderboardMetric; label: string }[] = [
  { value: "net_pnl", label: "Net PnL" },
  { value: "volume", label: "Volume" },
  { value: "rounds", label: "Rounds" },
];

// game_id 4 = Crash. Hidden from the filter when crash is disabled so the
// dropdown does not advertise a tab that always returns zero rows.
const GAME_OPTIONS_BASE: { value: LeaderboardGame; label: string }[] = [
  { value: "all", label: "All games" },
  { value: 1, label: "Lottery" },
  { value: 2, label: "Scratch" },
  { value: 3, label: "Number Match" },
  { value: 4, label: "Crash" },
  { value: 5, label: "Mines" },
  { value: 6, label: "Wheel" },
];

const GAME_OPTIONS = ENABLE_CRASH
  ? GAME_OPTIONS_BASE
  : GAME_OPTIONS_BASE.filter((g) => g.value !== 4);

// Server caps `limit` at 500. UI shows 5 pages of 100 rows.
const TOTAL_LIMIT = 500;
const PAGE_SIZE = 100;

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("7d");
  const [game, setGame] = useState<LeaderboardGame>("all");
  const [metric, setMetric] = useState<LeaderboardMetric>("net_pnl");
  const [page, setPage] = useState(1);

  // Reset to page 1 when filters change — a 7d net_pnl page 4 is meaningless
  // once the user flips to 24h volume.
  useEffect(() => {
    setPage(1);
  }, [period, game, metric]);

  const { walletAddress } = useGostopAuth();
  const { data, isLoading, isError, error, refetch } = useLeaderboard(
    period,
    game,
    metric,
    TOTAL_LIMIT,
  );

  const allRows = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const pageRows = allRows.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl text-gold">Leaderboard</h1>
        <p className="text-base text-neutral-200 max-w-2xl">
          Live rankings across every GoStop table. Anonymous players show as
          masked handles; opt-out players are hidden. Refreshed every 10
          seconds.
        </p>
      </header>

      <section className="panel p-5 space-y-4">
        <FilterBar
          period={period}
          game={game}
          metric={metric}
          onPeriod={setPeriod}
          onGame={setGame}
          onMetric={setMetric}
        />

        {isLoading && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-3 py-16 text-gold-200"
          >
            <svg
              className="w-5 h-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="2.5"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-sm uppercase tracking-widest">Loading…</span>
          </div>
        )}

        {isError && (
          <div>
            <p className="text-sm text-rose-300">
              Failed to load leaderboard: {error.message}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 text-sm text-gold-200 hover:text-gold-100"
            >
              Retry
            </button>
          </div>
        )}

        {data && allRows.length === 0 && (
          <p className="text-sm text-neutral-200">
            No rounds in this window yet.
          </p>
        )}

        {data && pageRows.length > 0 && (
          <>
            <LeaderboardTable
              rows={pageRows}
              wallet={walletAddress}
              metric={metric}
            />
            <Pagination
              currentPage={clampedPage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
            <p className="text-xs text-neutral-300 text-center">
              Showing {pageStart + 1}–{pageStart + pageRows.length} of{" "}
              {allRows.length} · refreshed every 10s.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function FilterBar({
  period,
  game,
  metric,
  onPeriod,
  onGame,
  onMetric,
}: {
  period: LeaderboardPeriod;
  game: LeaderboardGame;
  metric: LeaderboardMetric;
  onPeriod: (p: LeaderboardPeriod) => void;
  onGame: (g: LeaderboardGame) => void;
  onMetric: (m: LeaderboardMetric) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <FilterGroup label="Period">
        {PERIOD_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            active={period === opt.value}
            onClick={() => onPeriod(opt.value)}
          >
            {opt.label}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Metric">
        {METRIC_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            active={metric === opt.value}
            onClick={() => onMetric(opt.value)}
          >
            {opt.label}
          </FilterChip>
        ))}
      </FilterGroup>

      <label className="flex items-center gap-2 ml-auto">
        <span className="text-xs uppercase tracking-widest text-neutral-300">
          Game
        </span>
        <select
          value={String(game)}
          onChange={(e) => {
            const v = e.target.value;
            onGame(v === "all" ? "all" : (Number(v) as LeaderboardGame));
          }}
          className="bg-ink-900 border border-gold-subtle rounded-md px-2 py-1.5 text-sm text-neutral-100 focus:outline-none focus:border-gold-300/60"
        >
          {GAME_OPTIONS.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-widest text-neutral-300">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px] ${
        active
          ? "bg-gold-400/15 text-gold-200 border border-gold-300/40"
          : "border border-gold-subtle text-neutral-200 hover:text-gold-200 hover:border-gold-300/40"
      }`}
    >
      {children}
    </button>
  );
}

function LeaderboardTable({
  rows,
  wallet,
  metric,
}: {
  rows: LeaderboardRow[];
  wallet: string | undefined;
  metric: LeaderboardMetric;
}) {
  // Wallet stored as 0x… lowercase on backend; useGostopAuth returns the same
  // canonical form. Compare after lowercasing both sides defensively.
  const meKey = wallet ? wallet.toLowerCase() : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-widest text-neutral-300 border-b border-gold-subtle">
            <th className="text-left py-2 pr-3 font-medium w-12">#</th>
            <th className="text-left py-2 px-3 font-medium">Player</th>
            <th className="text-right py-2 px-3 font-medium">Rounds</th>
            <th className="text-right py-2 px-3 font-medium">Volume</th>
            <th className="text-right py-2 px-3 font-medium">Net PnL</th>
            <th className="text-right py-2 pl-3 font-medium hidden sm:table-cell">
              Last played
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row
              key={`${row.rank}:${row.player}`}
              row={row}
              isMe={meKey === row.player.toLowerCase()}
              metric={metric}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row,
  isMe,
  metric,
}: {
  row: LeaderboardRow;
  isMe: boolean;
  metric: LeaderboardMetric;
}) {
  const pnlPositive = (() => {
    try {
      return BigInt(row.net_pnl) >= 0n;
    } catch {
      return true;
    }
  })();

  return (
    <tr
      className={`border-b border-ink-800/60 last:border-0 ${
        isMe ? "bg-gold-400/10" : ""
      }`}
    >
      <td className="py-2 pr-3 font-mono text-gold-200">{row.rank}</td>
      <td className="py-2 px-3">
        <PlayerIdentity player={row.player} isMe={isMe} dense />
      </td>
      <td
        className={`py-2 px-3 text-right font-mono ${
          metric === "rounds" ? "text-gold-200" : "text-neutral-200"
        }`}
      >
        {row.rounds.toLocaleString("en-US")}
      </td>
      <td
        className={`py-2 px-3 text-right font-mono ${
          metric === "volume" ? "text-gold-200" : "text-neutral-200"
        }`}
      >
        {fmtUsdc(row.total_bet)}
      </td>
      <td
        className={`py-2 px-3 text-right font-mono ${
          metric === "net_pnl"
            ? pnlPositive
              ? "text-emerald-300"
              : "text-rose-300"
            : "text-neutral-200"
        }`}
      >
        {fmtUsdcSigned(row.net_pnl)}
      </td>
      <td className="py-2 pl-3 text-right text-xs text-neutral-300 hidden sm:table-cell">
        {fmtTimeAgo(row.last_played_ms)}
      </td>
    </tr>
  );
}
