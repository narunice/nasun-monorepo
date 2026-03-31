/**
 * DailyMissionsCard Component
 *
 * Checklist-style daily missions card (inspired by Pado's GettingStarted).
 * Completion is detected by the points scanner via todayCategories in the
 * /points/user/:address API response. Resets daily at UTC 00:00.
 * Faucet step includes a functional "Claim All Tokens" button.
 */

import { FC, useEffect, useState } from "react";
import { useAuth } from "@/features/auth";
import { getPointsUser } from "@/services/activityPointsApi";
import type { UserPoints } from "@/types/points";
import { OuterBox, Spinner } from "@/components/ui";
import { ClaimAllButton } from "@nasun/wallet-ui";

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
  description: string;
  points: number;
  showFaucet?: boolean;
}

const MISSIONS: Mission[] = [
  { id: "faucet", label: "Claim Tokens", description: "Use the faucet to get free test tokens", points: 1, showFaucet: true },
  { id: "wallet-transfer", label: "Send Tokens", description: "Transfer tokens to another wallet", points: 1 },
  { id: "pado-dex", label: "Spot Trade", description: "Place a trade on the DEX orderbook", points: 2 },
  { id: "pado-lottery", label: "Buy Lottery Ticket", description: "Pick 5 numbers and try your luck", points: 1 },
  { id: "pado-scratchcard", label: "Play Scratch Card", description: "Scratch and win instant prizes", points: 1 },
  { id: "pado-games", label: "Play Quick Pick", description: "Auto-pick numbers for a quick game", points: 1 },
];

export const DailyMissionsCard: FC<DailyMissionsCardProps> = ({ className = "", bare = false, pointsData }) => {
  const { user } = useAuth();
  const [fetchedPoints, setFetchedPoints] = useState<UserPoints | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nasunWalletAddress =
    user?.linkedAccounts?.["nasun wallet"]?.walletAddress ?? user?.walletAddress;
  const hasValidAddress = nasunWalletAddress && SUI_ADDRESS_RE.test(nasunWalletAddress);

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
  const completedCount = MISSIONS.filter((m) => todayCategories.includes(m.id)).length;

  const Wrapper = bare
    ? ({ children }: { children: React.ReactNode }) => <div className={className}>{children}</div>
    : ({ children }: { children: React.ReactNode }) => <OuterBox color="c5" padding="sm" className={className}>{children}</OuterBox>;

  if (isLoading && !useParentData) {
    return (
      <Wrapper>
        <h5 className="font-medium text-nasun-white mb-4">Daily Missions</h5>
        <div className="flex items-center justify-center py-8"><Spinner /></div>
      </Wrapper>
    );
  }

  if (error) {
    return (
      <Wrapper>
        <h5 className="font-medium text-nasun-white mb-4">Daily Missions</h5>
        <p className="text-red-400 text-sm text-center py-4">Failed to load missions</p>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h5 className="font-medium text-nasun-white flex items-center gap-2">
            Daily Missions
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
              Experimental
            </span>
          </h5>
          <p className="text-xs text-nasun-white/40 mt-0.5">
            {completedCount}/{MISSIONS.length} completed
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-nasun-c6/50 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / MISSIONS.length) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {MISSIONS.map((mission, i) => {
          const completed = todayCategories.includes(mission.id);
          return (
            <div key={mission.id} className="flex items-start gap-3">
              {/* Circle checkbox */}
              <div className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                completed
                  ? "bg-green-500 border-green-500"
                  : "border-nasun-white/20"
              }`}>
                {completed && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${
                  completed ? "text-nasun-white/40 line-through" : "text-nasun-white"
                }`}>
                  {i + 1}. {mission.label}
                  <span className="ml-2 text-xs font-mono text-nasun-white/25">+{mission.points}</span>
                </p>
                {!completed && (
                  <p className="text-xs text-nasun-white/40 mt-0.5">{mission.description}</p>
                )}
              </div>

              {/* Faucet claim button (step 1 only, when not yet completed) */}
              {mission.showFaucet && !completed && (
                <div className="shrink-0 w-40">
                  <ClaimAllButton />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Wrapper>
  );
};
