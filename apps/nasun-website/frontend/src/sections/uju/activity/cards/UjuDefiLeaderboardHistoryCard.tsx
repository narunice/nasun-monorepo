import { FC, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import {
  useAvailableWeeks,
  type ScoreLeaderboardResponse,
} from "@/features/pado-score-leaderboard/usePadoScoreLeaderboard";
import { useUjuWalletRegistration } from "../../hooks/useUjuWalletRegistration";
import { Spinner } from "@/components/ui";
import { UjuCard, UjuSectionHeader } from "../../shared";

const HISTORY_WEEKS_LIMIT = 8;

// All Nasun wallet addresses are stored and compared as lowercase. This
// invariant is enforced both here and in `useUjuWalletRegistration`.
const shortenAddress = (addr: string) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

function getChatHttpUrl(): string {
  return import.meta.env.VITE_NASUN_CHAT_HTTP_URL || "";
}

async function fetchWeeklyPadoLeaderboard(
  weekId: string,
): Promise<ScoreLeaderboardResponse> {
  const baseUrl = getChatHttpUrl();
  if (!baseUrl) {
    return { scope: "weekly", weekId, traders: [], updatedAt: 0, totalTraders: 0, totalParticipants: 0 };
  }
  const params = new URLSearchParams({ limit: "2000", offset: "0" });
  const res = await fetch(
    `${baseUrl}/api/pado/leaderboard/score/weekly/${weekId}?${params}`,
  );
  if (res.status === 404) {
    return { scope: "weekly", weekId, traders: [], updatedAt: 0, totalTraders: 0, totalParticipants: 0 };
  }
  if (!res.ok) throw new Error(`Pado leaderboard ${res.status}`);
  return res.json();
}

interface Props {
  className?: string;
}

interface WalletOption {
  address: string;        // lowercase
  label: string;
  isPrimary: boolean;
}

export const UjuDefiLeaderboardHistoryCard: FC<Props> = ({
  className = "",
}) => {
  const { user } = useAuth();
  const { registeredWallets } = useUjuWalletRegistration();
  const [isExpanded, setIsExpanded] = useState(false);

  // Primary nasun wallet (matches DailyMissionsCard pattern).
  const primaryAddress = useMemo(() => {
    const raw =
      user?.linkedAccounts?.["nasun wallet"]?.walletAddress ??
      user?.walletAddress ??
      null;
    return raw ? raw.toLowerCase() : null;
  }, [user]);

  // Wallet list: primary first, then registered extras (deduped).
  const walletList = useMemo<WalletOption[]>(() => {
    const list: WalletOption[] = [];
    if (primaryAddress) {
      list.push({ address: primaryAddress, label: "Primary", isPrimary: true });
    }
    for (const w of registeredWallets) {
      const addr = w.walletAddress.toLowerCase();
      if (addr === primaryAddress) continue;
      list.push({
        address: addr,
        label: w.label || shortenAddress(addr),
        isPrimary: false,
      });
    }
    return list;
  }, [primaryAddress, registeredWallets]);

  // Persisted selection per identityId.
  const storageKey = user?.identityId
    ? `uju:defi-leaderboard:selectedAddress:${user.identityId}`
    : null;

  const [selectedAddress, setSelectedAddress] = useState<string | null>(() => {
    if (!storageKey) return null;
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  // Reset on identityId change (logout / account switch).
  useEffect(() => {
    if (!storageKey) {
      setSelectedAddress(null);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      setSelectedAddress(stored);
    } catch {
      setSelectedAddress(null);
    }
  }, [storageKey]);

  // Fallback when current selection no longer exists in walletList (e.g. user
  // removed it from another tab) — drop back to primary.
  useEffect(() => {
    if (walletList.length === 0) return;
    const stillValid =
      selectedAddress != null &&
      walletList.some((w) => w.address === selectedAddress);
    if (!stillValid) {
      const fallback = walletList[0]!.address;
      setSelectedAddress(fallback);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, fallback);
        } catch {
          // ignore storage errors
        }
      }
    }
  }, [walletList, selectedAddress, storageKey]);

  const handleSelect = (addr: string) => {
    setSelectedAddress(addr);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, addr);
      } catch {
        // ignore storage errors
      }
    }
  };

  const activeAddress = selectedAddress;
  const showSwitcher = walletList.length > 1;

  const { data: weeksResp } = useAvailableWeeks();
  const weeks = weeksResp?.weeks ?? [];
  const recentWeeks = weeks.slice(0, HISTORY_WEEKS_LIMIT);

  // Always fetch the current (latest) week so we can show realtime rank.
  // Cache key is per weekId only — switching wallets does not refetch
  // (findRank is a client-side lookup against cached data).
  const currentWeekQuery = useQuery({
    queryKey: ["uju", "defi-history", "week", recentWeeks[0]?.weekId ?? ""],
    queryFn: () => fetchWeeklyPadoLeaderboard(recentWeeks[0]!.weekId),
    enabled: !!activeAddress && recentWeeks.length > 0,
    staleTime: 30_000,
  });

  // Past weeks loaded only when expanded.
  const pastWeeks = recentWeeks.slice(1);
  const pastQueries = useQueries({
    queries: pastWeeks.map((w) => ({
      queryKey: ["uju", "defi-history", "week", w.weekId],
      queryFn: () => fetchWeeklyPadoLeaderboard(w.weekId),
      enabled: !!activeAddress && isExpanded,
      staleTime: 5 * 60_000,
    })),
  });

  function findRank(data: ScoreLeaderboardResponse | undefined) {
    if (!data || !activeAddress) return null;
    const t = data.traders.find((x) => x.address.toLowerCase() === activeAddress);
    return t?.rank ?? null;
  }

  const currentRank = findRank(currentWeekQuery.data);
  const previousRank = pastQueries[0]?.data ? findRank(pastQueries[0].data) : null;

  let trend: "up" | "down" | "flat" | null = null;
  if (currentRank != null && previousRank != null) {
    if (currentRank < previousRank) trend = "up";
    else if (currentRank > previousRank) trend = "down";
    else trend = "flat";
  }

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

  // Empty-state branches:
  // - logged-out: tell the user to sign in.
  // - logged-in but no primary nasun wallet (mid-onboarding): tell them to register one.
  let emptyMessage: string | null = null;
  if (!user) {
    emptyMessage = "Sign in to view your Pado rank history.";
  } else if (!primaryAddress) {
    emptyMessage = "Register a Nasun wallet to view your Pado rank history.";
  }

  return (
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title="Pado DeFi Leaderboard History"
        subtitle="Weekly rank on the Pado trading leaderboard"
        trailing={headerTrailing}
      />

      {emptyMessage ? (
        <div className="flex flex-col items-center py-8 bg-uju-bg/30 rounded-xl border border-uju-border/10">
          <p className="text-uju-secondary font-light text-center px-6">
            {emptyMessage}
          </p>
        </div>
      ) : (
        <div className="space-y-4 mt-2">
          {/* Wallet selection row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-light text-uju-secondary">
              Viewing:{" "}
              <span className="text-uju-primary font-normal">
                {activeAddress ? shortenAddress(activeAddress) : "—"}
              </span>
              {activeAddress && activeAddress === primaryAddress && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-sm bg-pado-2/10 text-pado-2 border border-pado-2/30">
                  Primary
                </span>
              )}
            </div>
            {showSwitcher && (
              <select
                value={activeAddress ?? ""}
                onChange={(e) => handleSelect(e.target.value)}
                className="text-sm font-normal bg-uju-bg/40 border border-uju-border/30 rounded-lg px-3 py-1.5 text-uju-primary focus:border-pado-2/50 focus:outline-none"
                aria-label="Switch wallet"
              >
                {walletList.map((w) => (
                  <option key={w.address} value={w.address}>
                    {w.label} ({shortenAddress(w.address)})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-uju-bg/40 rounded-xl border border-uju-border/15">
            <div>
              <p className="text-sm font-semibold text-uju-secondary uppercase tracking-widest">
                Current Week
              </p>
              <p className="text-sm font-light text-uju-secondary/80 mt-0.5">
                {recentWeeks[0]?.label ?? "—"}
              </p>
            </div>
            <div className="text-right">
              {currentWeekQuery.isLoading ? (
                <Spinner />
              ) : currentRank != null ? (
                <p className="text-3xl font-semibold bg-gradient-to-r from-pado-2 via-pado-4 to-pado-5 bg-clip-text text-transparent tabular-nums">
                  #{currentRank}
                  {trend === "up" && <span className="text-pado-4 text-base ml-2">▲</span>}
                  {trend === "down" && <span className="text-rose-400 text-base ml-2">▼</span>}
                </p>
              ) : (
                <p className="text-uju-secondary font-light text-sm">Unranked</p>
              )}
            </div>
          </div>

          {isExpanded && (
            <div className="space-y-2 animate-fade-in">
              <h6 className="text-sm font-semibold text-uju-secondary uppercase tracking-[0.2em] px-1 mt-2">
                Past Weeks
              </h6>
              <div className="space-y-1.5">
                {pastWeeks.map((w, i) => {
                  const q = pastQueries[i];
                  const rank = q?.data ? findRank(q.data) : null;
                  return (
                    <div
                      key={w.weekId}
                      className="flex items-center justify-between px-4 py-2.5 bg-uju-bg/30 rounded-lg border border-uju-border/10"
                    >
                      <span className="text-sm font-light text-uju-primary">{w.label}</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {q?.isLoading ? (
                          <span className="text-uju-secondary/60">…</span>
                        ) : q?.isError ? (
                          <span className="text-rose-400/70">err</span>
                        ) : rank != null ? (
                          <span className="text-uju-primary">#{rank}</span>
                        ) : (
                          <span className="text-uju-secondary/60">Unranked</span>
                        )}
                      </span>
                    </div>
                  );
                })}
                {pastWeeks.length === 0 && (
                  <p className="text-sm font-light text-uju-secondary/70 text-center py-3">
                    No past weeks yet.
                  </p>
                )}
              </div>
              <Link
                to="/community/pado-leaderboard"
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

export default UjuDefiLeaderboardHistoryCard;
