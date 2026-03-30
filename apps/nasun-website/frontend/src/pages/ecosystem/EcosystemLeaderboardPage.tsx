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
import { PageTitle } from "../../components/ui/PageTitle";
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
        {/* Page Title */}
        <PageTitle as="h1">Ecosystem Leaderboard</PageTitle>

        {/* Experimental Season Banner */}
        <div className="mb-6 rounded-sm border border-nasun-c3/20 bg-nasun-c3/5 px-4 py-3">
          <p className="text-sm text-nasun-c3">
            <span className="font-semibold">Experimental Season</span>
            {" "}
            - Scoring rules and multiplier values may change based on community feedback and ecosystem data. Your contributions are tracked from day one.
          </p>
        </div>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-nasun-white/80">
            Earn points through diverse on-chain activity. Activate NFTs for score multipliers.
          </p>

          {/* Period Toggle */}
          <div className="flex w-full rounded-sm bg-nasun-c6/50 p-1 sm:w-auto">
            {(["daily", "weekly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`flex-1 rounded-sm px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
                  period === p
                    ? "bg-nasun-c3 text-nasun-black"
                    : "text-nasun-white/80 hover:text-nasun-white"
                }`}
              >
                {p === "daily" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
        </div>

        {/* Scoring Info */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-sm border border-nasun-c3/10 bg-nasun-c6/25 p-3">
            <p className="text-sm font-medium text-nasun-c3/90">Base Score</p>
            <p className="text-sm text-nasun-white/90">
              Distinct activity categories per day
            </p>
          </div>
          <div className="rounded-sm border border-nasun-c3/10 bg-nasun-c6/25 p-3">
            <p className="text-sm font-medium text-nasun-c3/90">Multiplier</p>
            <p className="text-sm text-nasun-white/90">
              Activated NFTs boost your score (Alliance, Genesis Pass, Battalion)
            </p>
          </div>
          <div className="rounded-sm border border-nasun-c3/10 bg-nasun-c6/25 p-3">
            <p className="text-sm font-medium text-nasun-c3/90">Ecosystem Score</p>
            <p className="text-sm text-nasun-white/90">
              Base Score x Multiplier = Final ranking score
            </p>
          </div>
        </div>

        {/* Table */}
        {error ? (
          <div className="rounded-sm bg-red-500/10 p-4 text-center text-sm text-red-400">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-nasun-c3/15 bg-nasun-c6/20">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nasun-c3/15 bg-nasun-c3/5">
                  <th className="px-4 py-3 text-left font-medium text-nasun-white/80">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-nasun-white/80">
                    User
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/80">
                    Base Score
                  </th>
                  <th className="hidden px-4 py-3 text-right font-medium text-nasun-white/80 sm:table-cell">
                    Multiplier
                  </th>
                  {period === "weekly" && (
                    <th className="px-4 py-3 text-right font-medium text-nasun-white/80">
                      Active Days
                    </th>
                  )}
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/80">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={period === "weekly" ? 6 : 5}
                      className="px-4 py-12 text-center text-nasun-white/70"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={period === "weekly" ? 6 : 5}
                      className="px-4 py-16 text-center"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <svg
                          className="h-10 w-10 text-nasun-c3/40"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                        <p className="text-sm text-nasun-white/70">
                          No activity recorded yet. Start using the ecosystem to appear here!
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr
                      key={entry.identityId}
                      className="border-b border-nasun-c3/8 transition-colors hover:bg-nasun-c3/8"
                    >
                      <td className="px-4 py-3 font-mono text-nasun-white/90">
                        #{entry.rank}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-nasun-white/80">
                          {truncateId(entry.identityId)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-nasun-white">
                        {entry.baseScore}
                      </td>
                      <td className="hidden px-4 py-3 text-right sm:table-cell">
                        <span
                          className={`font-mono ${
                            entry.multiplier > 1
                              ? "text-nasun-c3"
                              : "text-nasun-white/80"
                          }`}
                        >
                          {entry.multiplier.toFixed(1)}x
                        </span>
                      </td>
                      {period === "weekly" && (
                        <td className="px-4 py-3 text-right font-mono text-nasun-white/80">
                          {entry.activeDays}/7
                        </td>
                      )}
                      <td className="px-4 py-3 text-right font-bold text-nasun-c3">
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
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm text-nasun-white/70">
              Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of{" "}
              {total} participants
            </p>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="min-h-[44px] rounded-sm bg-nasun-c6/30 px-4 py-1.5 text-sm text-nasun-white transition-colors hover:bg-nasun-c3/8 disabled:opacity-30"
              >
                Previous
              </button>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="min-h-[44px] rounded-sm bg-nasun-c6/30 px-4 py-1.5 text-sm text-nasun-white transition-colors hover:bg-nasun-c3/8 disabled:opacity-30"
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
