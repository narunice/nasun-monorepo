import { FC, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import {
  getEcosystemLeaderboardFull,
  getAvailableEcosystemWeeks,
  identityToDisplayId,
} from "@/services/ecosystemScoreApi";
import { Spinner } from "@/components/ui";
import { UjuCard, UjuSectionHeader } from "../../shared";

const HISTORY_WEEKS_LIMIT = 8;

interface Props {
  className?: string;
}

export const UjuEcosystemLeaderboardHistoryCard: FC<Props> = ({
  className = "",
}) => {
  const { user } = useAuth();
  const identityId = user?.identityId;
  const [isExpanded, setIsExpanded] = useState(false);

  // Leaderboard rows now expose only an opaque displayId (no raw identityId),
  // so derive the user's own displayId once per identityId change and match
  // by that. Browser SubtleCrypto is async; the SHA-256 of a short string
  // resolves on the next microtask so this is effectively synchronous in
  // practice.
  const [myDisplayId, setMyDisplayId] = useState<string | null>(null);
  useEffect(() => {
    if (!identityId) {
      setMyDisplayId(null);
      return;
    }
    let cancelled = false;
    identityToDisplayId(identityId).then((id) => {
      if (!cancelled) setMyDisplayId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [identityId]);

  const { data: weeks } = useQuery({
    queryKey: ["uju", "ecosystem-history", "weeks"],
    queryFn: getAvailableEcosystemWeeks,
    staleTime: 2 * 60_000,
  });

  const recentWeeks = (weeks ?? []).slice(0, HISTORY_WEEKS_LIMIT);

  const queries = useQueries({
    queries: recentWeeks.map((w) => ({
      queryKey: ["uju", "ecosystem-history", "week", w.weekId],
      queryFn: () => getEcosystemLeaderboardFull(w.weekId),
      enabled: !!identityId && isExpanded,
      staleTime: 60_000,
    })),
  });

  const headerTrailing = (
    <button
      onClick={() => setIsExpanded((p) => !p)}
      className="text-uju-secondary hover:text-uju-primary transition-colors text-sm font-semibold uppercase tracking-widest flex items-center gap-2"
    >
      {isExpanded ? "Collapse" : "Expand History"}
      <svg
        className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  const rows = recentWeeks.map((w, i) => {
    const q = queries[i];
    if (!q) return { weekId: w.weekId, label: w.label, state: "idle" as const };
    if (q.isLoading) return { weekId: w.weekId, label: w.label, state: "loading" as const };
    if (q.isError) return { weekId: w.weekId, label: w.label, state: "error" as const };
    const entry = myDisplayId
      ? q.data?.data.find((e) => e.displayId === myDisplayId)
      : undefined;
    return {
      weekId: w.weekId,
      label: w.label,
      state: "ready" as const,
      rank: entry?.rank ?? null,
      score: entry?.weeklyScore ?? null,
      total: q.data?.meta.total ?? 0,
    };
  });

  const currentRow = rows[0];
  const previousRow = rows[1];
  let trend: "up" | "down" | "flat" | null = null;
  if (
    currentRow?.state === "ready" &&
    previousRow?.state === "ready" &&
    currentRow.rank != null &&
    previousRow.rank != null
  ) {
    if (currentRow.rank < previousRow.rank) trend = "up";
    else if (currentRow.rank > previousRow.rank) trend = "down";
    else trend = "flat";
  }

  return (
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title="Nasun Ecosystem Leaderboard History"
        subtitle="Weekly rank on the Nasun Ecosystem leaderboard"
        trailing={headerTrailing}
      />

      {!identityId ? (
        <div className="flex flex-col items-center py-8 bg-uju-bg/30 rounded-xl border border-uju-border/10">
          <p className="text-uju-secondary font-light text-center px-6">
            Sign in to view your ecosystem rank history.
          </p>
        </div>
      ) : (
        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between p-4 bg-uju-bg/40 rounded-xl border border-uju-border/15">
            <div>
              <p className="text-sm font-semibold text-uju-primary uppercase tracking-widest">
                Current Week
              </p>
              <p className="text-sm font-light text-uju-secondary mt-0.5">
                {currentRow?.label ?? "—"}
              </p>
            </div>
            <div className="text-right">
              {currentRow?.state === "ready" ? (
                currentRow.rank != null ? (
                  <p className="text-3xl font-semibold bg-gradient-to-r from-pado-2 via-pado-4 to-pado-5 bg-clip-text text-transparent tabular-nums">
                    #{currentRow.rank}
                    {trend === "up" && (
                      <span className="text-pado-4 text-base ml-2">▲</span>
                    )}
                    {trend === "down" && (
                      <span className="text-rose-400 text-base ml-2">▼</span>
                    )}
                  </p>
                ) : (
                  <p className="text-uju-secondary font-light text-sm">Unranked</p>
                )
              ) : currentRow?.state === "loading" ? (
                <Spinner />
              ) : (
                <Link
                  to="/leaderboards/nasun-ecosystem-leaderboard"
                  className="text-pado-2 text-sm font-semibold"
                >
                  View leaderboard →
                </Link>
              )}
            </div>
          </div>

          {isExpanded && (
            <div className="space-y-2 animate-fade-in">
              <h6 className="text-sm font-semibold text-uju-primary uppercase tracking-[0.2em] px-1 mt-2">
                Past Weeks
              </h6>
              <div className="space-y-1.5">
                {rows.slice(1).map((row) => (
                  <div
                    key={row.weekId}
                    className="flex items-center justify-between px-4 py-2.5 bg-uju-bg/30 rounded-lg border border-uju-border/10"
                  >
                    <span className="text-sm font-light text-uju-primary">
                      {row.label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {row.state === "loading" ? (
                        <span className="text-uju-secondary">…</span>
                      ) : row.state === "error" ? (
                        <span className="text-rose-400/70">err</span>
                      ) : row.rank != null ? (
                        <span className="text-uju-primary">#{row.rank}</span>
                      ) : (
                        <span className="text-uju-secondary">Unranked</span>
                      )}
                    </span>
                  </div>
                ))}
                {rows.length <= 1 && (
                  <p className="text-sm font-light text-uju-secondary text-center py-3">
                    No past weeks yet.
                  </p>
                )}
              </div>
              <Link
                to="/leaderboards/nasun-ecosystem-leaderboard"
                className="flex items-center justify-center gap-2 py-3 mt-2 border-t border-uju-border/10 text-pado-2 hover:text-pado-4 font-semibold text-sm transition-all"
              >
                View Full Leaderboard →
              </Link>
            </div>
          )}
        </div>
      )}
    </UjuCard>
  );
};

export default UjuEcosystemLeaderboardHistoryCard;
