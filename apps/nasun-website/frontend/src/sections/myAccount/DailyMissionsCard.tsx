/**
 * DailyMissionsCard Component
 *
 * Shows today's activity missions based on on-chain activity detection.
 * Missions reset daily at UTC 00:00. Completion is detected by the
 * points scanner (runs every 5 minutes) via todayCategories in the
 * /points/user/:address API response.
 *
 * 6 static missions (4 coming-soon, 2 active) + 1 conditional governance mission.
 * Governance mission shown only when hasActiveProposals === true from backend.
 * Tier bonuses removed from UI (backend still awards them based on 7 categories).
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
  comingSoon?: boolean;
}

const DAILY_MISSIONS: Mission[] = [
  { id: "faucet", label: "Claim Tokens", points: 0, link: "", external: true, comingSoon: true },
  { id: "wallet-transfer", label: "Send Tokens", points: 0, link: "", external: true, comingSoon: true },
  { id: "pado-lottery", label: "Buy Lottery Ticket", points: 5, link: "https://pado.finance/lottery", external: true },
  { id: "pado-scratchcard", label: "Play Scratch Card", points: 5, link: "https://pado.finance/scratchcard", external: true },
  { id: "pado-games", label: "Play Quick Pick", points: 0, link: "", external: true, comingSoon: true },
  // pado-dex: shown as "coming soon" per product decision; backend still awards daily bonus
  { id: "pado-dex", label: "Spot Trade", points: 0, link: "", external: true, comingSoon: true },
];

const GOVERNANCE_MISSION: Mission = {
  id: "governance", label: "Governance Vote", points: 10, link: "/network/governance", external: false,
};

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

  // Governance: show when active proposals exist (completed or not)
  // todayCategories includes "governance" = user voted today (checkmark)
  // Note: if multiple active proposals exist and user voted on one,
  // this still shows as completed (daily mission = "vote on A proposal today")
  const showGovernance = points?.hasActiveProposals === true;
  const missions = showGovernance
    ? [...DAILY_MISSIONS, GOVERNANCE_MISSION]
    : DAILY_MISSIONS;

  const activeMissions = missions.filter((m) => !m.comingSoon);
  const completedCount = activeMissions.filter((m) => todayCategories.includes(m.id)).length;

  const title = (
    <div className="flex items-center justify-between mb-4">
      <h5 className="font-medium uppercase text-nasun-white flex items-center gap-2">
        Today's Missions
      </h5>
      <span className="text-base text-nasun-white/50">
        {completedCount}/{activeMissions.length}
      </span>
    </div>
  );

  if (!hasValidAddress) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        {title}
        <p className="text-nasun-white/50 text-center text-base py-4">
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
        <p className="text-red-400 text-base text-center py-4">
          Failed to load missions
        </p>
      </OuterBox>
    );
  }

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      {title}
      <div className="flex flex-col gap-2">
        {missions.map((mission) => {
          if (mission.comingSoon) {
            return (
              <div
                key={mission.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-sm border bg-nasun-c6/30 border-nasun-c5/10"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-nasun-white/20">{"\u2610"}</span>
                  <span className="text-nasun-white/30 text-base">{mission.label}</span>
                </div>
                <span className="text-sm text-nasun-white/20 italic">coming soon</span>
              </div>
            );
          }

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
                <span className={completed ? "text-nasun-white text-base" : "text-nasun-white/70 text-base"}>
                  {mission.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-mono ${completed ? "text-nasun-c1" : "text-nasun-white/40"}`}>
                  +{mission.points}
                </span>
                {completed ? (
                  <span className="text-sm text-emerald-400/60">done</span>
                ) : (
                  <a
                    href={mission.link}
                    {...(mission.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="text-sm text-nasun-c3 hover:text-nasun-c1 transition-colors"
                  >
                    go &rarr;
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-nasun-white/30 mt-3 text-center">
        Updates every few minutes &middot; Resets daily at 00:00 UTC
      </p>
    </OuterBox>
  );
};
