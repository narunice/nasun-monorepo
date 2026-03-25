/**
 * ActivityPointsAdmin - On-Chain Activity Points Dashboard
 *
 * Read-only admin view: scanner health, leaderboard, user lookup.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { StatCard } from "../components/StatCard";
import { OuterBox } from "@/components/ui";
import {
  getPointsHealth,
  getPointsLeaderboard,
  getPointsUser,
} from "@/services/activityPointsApi";
import type { ScannerHealth, LeaderboardEntry, UserPoints } from "@/types/points";

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;
const HEALTH_POLL_MS = 30_000;

export const ActivityPointsAdmin = () => {
  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-nasun-white mb-6">Activity Points</h1>
      <div className="space-y-6">
        <ScannerHealthSection />
        <LeaderboardSection />
        <UserLookupSection />
      </div>
    </AdminLayout>
  );
};

// --- Scanner Health ---

function ScannerHealthSection() {
  const [health, setHealth] = useState<ScannerHealth | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getPointsHealth();
      setHealth(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    refresh();

    timerRef.current = setInterval(() => {
      if (!document.hidden) refresh();
    }, HEALTH_POLL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  if (!health) {
    return (
      <OuterBox color="c5" padding="sm">
        <h2 className="text-lg font-semibold text-nasun-white mb-4">Scanner Status</h2>
        <p className="text-nasun-white/50 text-sm">Loading...</p>
      </OuterBox>
    );
  }

  const lastScan = health.processedAt
    ? timeAgo(new Date(health.processedAt))
    : "Never";

  return (
    <OuterBox color="c5" padding="sm">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-nasun-white">Scanner Status</h2>
        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${
          health.enabled
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-red-500/20 text-red-400"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${health.enabled ? "bg-emerald-400" : "bg-red-400"}`} />
          {health.enabled ? (health.isScanning ? "Scanning" : "Idle") : "Disabled"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Last Scan" value={lastScan} />
        <StatCard label="TX Processed" value={health.txCount.toLocaleString("en-US")} />
        <StatCard label="Wallets" value={health.registeredWallets.toLocaleString("en-US")} />
        <StatCard label="Genesis Pass" value={health.genesisPassHolders} />
      </div>
    </OuterBox>
  );
}

// --- Leaderboard ---

function LeaderboardSection() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const limit = 50;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getPointsLeaderboard(limit, page * limit)
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  return (
    <OuterBox color="c5" padding="sm">
      <h2 className="text-lg font-semibold text-nasun-white mb-4">Points Leaderboard</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-nasun-white/10 text-nasun-white/60 text-left">
              <th className="pb-2 pr-3 w-12">#</th>
              <th className="pb-2 pr-3">Identity</th>
              <th className="pb-2 pr-3 text-right">Points</th>
              <th className="pb-2 pr-3 text-right">Activities</th>
              <th className="pb-2 text-right">Categories</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nasun-white/5">
            {isLoading ? (
              <tr><td colSpan={5} className="py-8 text-center text-nasun-white/50">Loading...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-nasun-white/50">No data</td></tr>
            ) : entries.map((entry) => (
              <tr key={entry.identityId} className="hover:bg-nasun-white/5 transition-colors">
                <td className="py-2 pr-3 text-nasun-white/60">{entry.rank}</td>
                <td className="py-2 pr-3 text-nasun-white font-mono text-xs truncate max-w-[200px]">
                  {entry.identityId}
                </td>
                <td className="py-2 pr-3 text-right text-nasun-white font-medium">
                  {Number(entry.totalPoints).toLocaleString("en-US")}
                </td>
                <td className="py-2 pr-3 text-right text-nasun-white/70">{entry.activityCount}</td>
                <td className="py-2 text-right text-nasun-white/70">{entry.activeCategories}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-3 py-1 rounded bg-nasun-white/10 text-nasun-white disabled:opacity-30 hover:bg-nasun-white/20 transition-colors"
        >
          Previous
        </button>
        <span className="text-nasun-white/50">Page {page + 1}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={entries.length < limit}
          className="px-3 py-1 rounded bg-nasun-white/10 text-nasun-white disabled:opacity-30 hover:bg-nasun-white/20 transition-colors"
        >
          Next
        </button>
      </div>
    </OuterBox>
  );
}

// --- User Lookup ---

function UserLookupSection() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<UserPoints | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const trimmed = address.trim().toLowerCase();
    if (!SUI_ADDRESS_RE.test(trimmed)) {
      setError("Invalid Sui address (expected 0x + 64 hex chars)");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await getPointsUser(trimmed);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OuterBox color="c5" padding="sm">
      <h2 className="text-lg font-semibold text-nasun-white mb-4">User Lookup</h2>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="0x... wallet address"
          className="flex-1 bg-nasun-dark-700/50 border border-nasun-dark-500/30 rounded-lg px-3 py-2 text-nasun-white text-sm font-mono placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4/50"
        />
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="px-4 py-2 rounded-lg bg-nasun-c4/30 text-nasun-white text-sm hover:bg-nasun-c4/50 transition-colors disabled:opacity-50"
        >
          {isLoading ? "..." : "Search"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {searched && !isLoading && !error && !result && (
        <p className="text-nasun-white/50 text-sm">No points found for this address</p>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Points" value={Number(result.totalPoints).toLocaleString("en-US")} />
            <StatCard label="Activities" value={result.activityCount} />
            <StatCard
              label="First Activity"
              value={result.firstActivity ? new Date(result.firstActivity).toLocaleDateString("en-US") : "N/A"}
            />
            <StatCard
              label="Last Activity"
              value={result.lastActivity ? new Date(result.lastActivity).toLocaleDateString("en-US") : "N/A"}
            />
          </div>

          {result.identityId && (
            <p className="text-xs text-nasun-white/40 font-mono truncate">
              Identity: {result.identityId}
            </p>
          )}

          {result.categories.length > 0 && (
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="border-b border-nasun-white/10 text-nasun-white/60 text-left">
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3 text-right">Points</th>
                  <th className="pb-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nasun-white/5">
                {result.categories.map((cat) => (
                  <tr key={cat.category}>
                    <td className="py-1.5 pr-3 text-nasun-white">{cat.category}</td>
                    <td className="py-1.5 pr-3 text-right text-nasun-white/70">
                      {Number(cat.points).toLocaleString("en-US")}
                    </td>
                    <td className="py-1.5 text-right text-nasun-white/70">{cat.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </OuterBox>
  );
}

// --- Helpers ---

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
