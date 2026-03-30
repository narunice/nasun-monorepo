/**
 * DailyMissionsCard Component
 *
 * Shows today's activity missions based on on-chain activity detection.
 * Missions reset daily at UTC 00:00. Completion is detected by the
 * points scanner (runs every 5 minutes) via todayCategories in the
 * /points/user/:address API response.
 *
 * 6 static missions (2 active, 4 disabled) + 1 conditional governance mission.
 * Governance mission shown only when hasActiveProposals === true from backend.
 * Points shown are base activity points from config/points.ts.
 */

import { FC, useEffect, useState } from "react";
import { useAuth } from "@/features/auth";
import { getPointsUser } from "@/services/activityPointsApi";
import type { UserPoints } from "@/types/points";
import { OuterBox, Spinner } from "@/components/ui";

interface DailyMissionsCardProps {
  className?: string;
  /** Render without OuterBox wrapper (for embedding inside another card) */
  bare?: boolean;
  /** Pass points data from parent to avoid duplicate API fetch */
  pointsData?: UserPoints | null;
}

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

interface Mission {
  id: string;
  label: string;
  points: number;
  link: string;
  external: boolean;
  disabled?: boolean;
}

// Points = base activity points from config/points.ts (not daily-mission bonus)
const DAILY_MISSIONS: Mission[] = [
  { id: "faucet", label: "Claim Tokens", points: 1, link: "", external: false },
  { id: "wallet-transfer", label: "Send Tokens", points: 1, link: "", external: true, disabled: true },
  { id: "pado-dex", label: "Spot Trade", points: 2, link: "https://pado.finance/markets/spot", external: true, disabled: true },
  { id: "pado-lottery", label: "Buy Lottery Ticket", points: 1, link: "https://pado.finance/lottery", external: true },
  { id: "pado-scratchcard", label: "Play Scratch Card", points: 1, link: "https://pado.finance/scratchcard", external: true },
  { id: "pado-games", label: "Play Quick Pick", points: 1, link: "https://pado.finance/scratchcard", external: true, disabled: true },
];

const GOVERNANCE_MISSION: Mission = {
  id: "governance", label: "Governance Vote", points: 10, link: "/network/governance", external: false,
};

export const DailyMissionsCard: FC<DailyMissionsCardProps> = ({ className = "", bare = false, pointsData }) => {
  const { user } = useAuth();
  const [fetchedPoints, setFetchedPoints] = useState<UserPoints | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nasunWalletAddress =
    user?.linkedAccounts?.["nasun wallet"]?.walletAddress ?? user?.walletAddress;
  const hasValidAddress = nasunWalletAddress && SUI_ADDRESS_RE.test(nasunWalletAddress);

  // Skip internal fetch when pointsData is provided from parent
  const useParentData = pointsData !== undefined;
  const points = useParentData ? pointsData : fetchedPoints;

  useEffect(() => {
    if (useParentData || !hasValidAddress) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getPointsUser(nasunWalletAddress!)
      .then((data) => {
        if (!cancelled) setFetchedPoints(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [useParentData, nasunWalletAddress, hasValidAddress]);

  const todayCategories = points?.todayCategories ?? [];

  // Governance: show when active proposals exist (completed or not)
  // todayCategories includes "governance" = user voted today (checkmark)
  // Note: if multiple active proposals exist and user voted on one,
  // this still shows as completed (daily mission = "vote on A proposal today")
  const showGovernance = points?.hasActiveProposals === true;
  const missions = showGovernance
    ? [...DAILY_MISSIONS, GOVERNANCE_MISSION]
    : DAILY_MISSIONS;

  const activeMissions = missions.filter((m) => !m.disabled);
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

  const Wrapper = bare
    ? ({ children }: { children: React.ReactNode }) => <div className={className}>{children}</div>
    : ({ children }: { children: React.ReactNode }) => <OuterBox color="c5" padding="sm" className={className}>{children}</OuterBox>;

  if (!hasValidAddress) {
    return (
      <Wrapper>
        {title}
        <p className="text-nasun-white/50 text-center text-base py-4">
          Connect Nasun Wallet to view daily missions
        </p>
      </Wrapper>
    );
  }

  if (isLoading && !useParentData) {
    return (
      <Wrapper>
        {title}
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </Wrapper>
    );
  }

  if (error) {
    return (
      <Wrapper>
        {title}
        <p className="text-red-400 text-base text-center py-4">
          Failed to load missions
        </p>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {title}
      <div className="flex flex-col gap-2">
        {missions.map((mission) => {
          if (mission.disabled) {
            return (
              <div
                key={mission.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-sm border bg-nasun-c6/30 border-nasun-c5/10"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-nasun-white/20">{"\u2610"}</span>
                  <span className="text-nasun-white/30 text-base">{mission.label}</span>
                </div>
                <span className="text-sm font-mono text-nasun-white/20">+{mission.points}</span>
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
                ) : mission.link ? (
                  <a
                    href={mission.link}
                    {...(mission.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="text-sm text-nasun-c3 hover:text-nasun-c1 transition-colors"
                  >
                    go &rarr;
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Wrapper>
  );
};
