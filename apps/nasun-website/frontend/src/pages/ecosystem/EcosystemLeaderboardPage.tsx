/**
 * Ecosystem Leaderboard Page
 *
 * Displays daily/weekly ecosystem scores with NFT multipliers.
 * "Experimental Season" banner to set user expectations.
 */

import { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import {
  getEcosystemLeaderboard,
  type EcosystemLeaderboardEntry,
} from "@/services/ecosystemScoreApi";

type Period = "daily" | "weekly";
const PAGE_SIZE = 50;

const EcosystemLeaderboardPage = () => {
  const [period, setPeriod] = useState<Period>("daily");
  const [entries, setEntries] = useState<EcosystemLeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEcosystemLeaderboard(period, PAGE_SIZE, offset);
      setEntries(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError("Failed to load leaderboard. Please try again.");
      console.error("[EcosystemLeaderboard]", err);
    } finally {
      setLoading(false);
    }
  }, [period, offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setOffset(0);
  };

  return (
    <PageLayout>
      <Helmet>
        <title>Ecosystem Leaderboard - NASUN</title>
        <meta
          name="description"
          content="Nasun Ecosystem Leaderboard. Compete with your on-chain activity score, boosted by NFT multipliers."
        />
      </Helmet>

      <SectionLayout maxWidth="7xl" className="pt-8 md:pt-12">
        {/* Experimental Season Banner */}
        <div className="mb-6 rounded-lg border border-nasun-c4/30 bg-nasun-c4/5 px-4 py-3">
          <p className="text-sm text-nasun-c4">
            <span className="font-semibold">Experimental Season</span>
            {" "}
            - Scoring rules and multiplier values may change based on community feedback and ecosystem data. Your contributions are tracked from day one.
          </p>
        </div>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-nasun-white">
              Ecosystem Leaderboard
            </h1>
            <p className="mt-1 text-sm text-nasun-white/60">
              Earn points through diverse on-chain activity. Activate NFTs for score multipliers.
            </p>
          </div>

          {/* Period Toggle */}
          <div className="flex rounded-lg bg-nasun-c6/50 p-1">
            {(["daily", "weekly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-nasun-c4 text-white"
                    : "text-nasun-white/60 hover:text-nasun-white"
                }`}
              >
                {p === "daily" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
        </div>

        {/* Scoring Info */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-nasun-c6/30 p-3">
            <p className="text-xs text-nasun-white/50">Base Score</p>
            <p className="text-sm text-nasun-white">
              Distinct activity categories per day (max 6+)
            </p>
          </div>
          <div className="rounded-lg bg-nasun-c6/30 p-3">
            <p className="text-xs text-nasun-white/50">Multiplier</p>
            <p className="text-sm text-nasun-white">
              Activated NFTs boost your score (Alliance, Genesis Pass, Battalion)
            </p>
          </div>
          <div className="rounded-lg bg-nasun-c6/30 p-3">
            <p className="text-xs text-nasun-white/50">Ecosystem Score</p>
            <p className="text-sm text-nasun-white">
              Base Score x Multiplier = Final ranking score
            </p>
          </div>
        </div>

        {/* Table */}
        {error ? (
          <div className="rounded-lg bg-red-500/10 p-4 text-center text-red-400">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-nasun-c6/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nasun-c6/50 bg-nasun-c6/20">
                  <th className="px-4 py-3 text-left font-medium text-nasun-white/60">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-nasun-white/60">
                    User
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/60">
                    Base Score
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/60">
                    Multiplier
                  </th>
                  {period === "weekly" && (
                    <th className="px-4 py-3 text-right font-medium text-nasun-white/60">
                      Active Days
                    </th>
                  )}
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/60">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={period === "weekly" ? 6 : 5}
                      className="px-4 py-12 text-center text-nasun-white/40"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={period === "weekly" ? 6 : 5}
                      className="px-4 py-12 text-center text-nasun-white/40"
                    >
                      No activity recorded yet. Start using the ecosystem to appear here!
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr
                      key={entry.identityId}
                      className="border-b border-nasun-c6/20 transition-colors hover:bg-nasun-c6/10"
                    >
                      <td className="px-4 py-3 font-mono text-nasun-white/80">
                        #{entry.rank}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-nasun-white/60">
                          {truncateId(entry.identityId)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-nasun-white">
                        {entry.baseScore}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-mono ${
                            entry.multiplier > 1
                              ? "text-nasun-c3"
                              : "text-nasun-white/60"
                          }`}
                        >
                          {entry.multiplier.toFixed(1)}x
                        </span>
                      </td>
                      {period === "weekly" && (
                        <td className="px-4 py-3 text-right font-mono text-nasun-white/60">
                          {entry.activeDays}/7
                        </td>
                      )}
                      <td className="px-4 py-3 text-right font-bold text-nasun-c4">
                        {entry.ecosystemScore.toFixed(1)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-nasun-white/40">
              Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of{" "}
              {total} participants
            </p>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="rounded-md bg-nasun-c6/30 px-3 py-1.5 text-sm text-nasun-white disabled:opacity-30"
              >
                Previous
              </button>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="rounded-md bg-nasun-c6/30 px-3 py-1.5 text-sm text-nasun-white disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </SectionLayout>
    </PageLayout>
  );
};

function truncateId(id: string): string {
  // Cognito ID format: "region:uuid", show last 8 chars of UUID
  const parts = id.split(":");
  if (parts.length === 2) {
    const uuid = parts[1];
    return `...${uuid.slice(-8)}`;
  }
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-6)}` : id;
}

export default EcosystemLeaderboardPage;
