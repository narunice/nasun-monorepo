/**
 * DailyMissionsCard Component
 *
 * Shows today's activity missions based on on-chain activity detection.
 * Missions reset daily at UTC 00:00. Completion is detected by the
 * points scanner (runs every 5 minutes) via todayCategories in the
 * /points/user/:address API response.
 *
 * 6 missions with tiered bonus: 4/6 (+5), 5/6 (+10), 6/6 (+20).
 */

import { FC, useEffect, useState } from "react";
import { useAuth } from "@/features/auth";
import { getPointsUser } from "@/services/activityPointsApi";
import type { UserPoints } from "@/types/points";
import { OuterBox, Spinner } from "@/components/ui";

interface DailyMissionsCardProps {
  className?: string;
}

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

interface Mission {
  id: string;
  label: string;
  points: number;
  link: string;
  external: boolean;
}

const DAILY_MISSIONS: Mission[] = [
  { id: "pado-dex", label: "Spot Trade", points: 10, link: "https://pado.finance/markets/spot", external: true },
  { id: "pado-lottery", label: "Buy Lottery Ticket", points: 10, link: "https://pado.finance/lottery", external: true },
  { id: "governance", label: "Vote on Proposal", points: 20, link: "/governance", external: false },
  { id: "pado-perp", label: "Open Perp Position", points: 10, link: "https://pado.finance/markets/perp", external: true },
  { id: "pado-scratchcard", label: "Buy Scratch Card", points: 10, link: "https://pado.finance/scratchcard", external: true },
  { id: "baram-ai", label: "Use Baram AI", points: 12, link: "https://baram.io", external: true },
];

const TIER_BONUSES = [
  { threshold: 4, label: "Tier 4 Bonus", points: 5 },
  { threshold: 5, label: "Tier 5 Bonus", points: 10 },
  { threshold: 6, label: "All Clear!", points: 20 },
];

export const DailyMissionsCard: FC<DailyMissionsCardProps> = ({ className = "" }) => {
  const { user } = useAuth();
  const [points, setPoints] = useState<UserPoints | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nasunWalletAddress =
    user?.linkedAccounts?.["nasun wallet"]?.walletAddress ?? user?.walletAddress;
  const hasValidAddress = nasunWalletAddress && SUI_ADDRESS_RE.test(nasunWalletAddress);

  useEffect(() => {
    if (!hasValidAddress) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getPointsUser(nasunWalletAddress!)
      .then((data) => {
        if (!cancelled) setPoints(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [nasunWalletAddress, hasValidAddress]);

  const todayCategories = points?.todayCategories ?? [];
  const completedCount = DAILY_MISSIONS.filter((m) => todayCategories.includes(m.id)).length;

  const title = (
    <div className="flex items-center justify-between mb-4">
      <h5 className="font-medium uppercase text-nasun-white flex items-center gap-2">
        Today's Missions
      </h5>
      <span className="text-sm text-nasun-white/50">
        {completedCount}/{DAILY_MISSIONS.length}
      </span>
    </div>
  );

  if (!hasValidAddress) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        {title}
        <p className="text-nasun-white/50 text-center text-sm py-4">
          Connect Nasun Wallet to view daily missions
        </p>
      </OuterBox>
    );
  }

  if (isLoading) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        {title}
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </OuterBox>
    );
  }

  if (error) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        {title}
        <p className="text-red-400 text-sm text-center py-4">
          Failed to load missions
        </p>
      </OuterBox>
    );
  }

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      {title}
      <div className="flex flex-col gap-2">
        {DAILY_MISSIONS.map((mission) => {
          const completed = todayCategories.includes(mission.id);
          return (
            <div
              key={mission.id}
              className={`flex items-center justify-between px-3 py-2.5 rounded-sm border transition-colors ${
                completed
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-nasun-c6/50 border-nasun-c5/20"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={completed ? "text-emerald-400" : "text-nasun-white/30"}>
                  {completed ? "\u2611" : "\u2610"}
                </span>
                <span className={completed ? "text-nasun-white text-sm" : "text-nasun-white/70 text-sm"}>
                  {mission.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono ${completed ? "text-nasun-c1" : "text-nasun-white/40"}`}>
                  +{mission.points}
                </span>
                {completed ? (
                  <span className="text-xs text-emerald-400/60">done</span>
                ) : (
                  <a
                    href={mission.link}
                    {...(mission.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="text-xs text-nasun-c3 hover:text-nasun-c1 transition-colors"
                  >
                    go &rarr;
                  </a>
                )}
              </div>
            </div>
          );
        })}
        {/* Tiered bonus rows */}
        {TIER_BONUSES.map((tier) => {
          const earned = completedCount >= tier.threshold;
          if (!earned && completedCount < tier.threshold - 1) return null;
          return (
            <div
              key={tier.threshold}
              className={`flex items-center justify-between px-3 py-2.5 rounded-sm border ${
                earned
                  ? "bg-nasun-c1/10 border-nasun-c1/30"
                  : "bg-nasun-c6/30 border-nasun-c5/10"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={earned ? "text-nasun-c1" : "text-nasun-white/20"}>
                  {tier.threshold === 6 ? "\u2605" : "\u25C6"}
                </span>
                <span className={`text-sm ${earned ? "text-nasun-white font-medium" : "text-nasun-white/40"}`}>
                  {tier.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono ${earned ? "text-nasun-c1" : "text-nasun-white/30"}`}>
                  +{tier.points}
                </span>
                {earned && (
                  <span className="text-xs text-nasun-c1/60">bonus</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-nasun-white/30 mt-3 text-center">
        Updates every few minutes &middot; Resets daily at 00:00 UTC
      </p>
    </OuterBox>
  );
};
