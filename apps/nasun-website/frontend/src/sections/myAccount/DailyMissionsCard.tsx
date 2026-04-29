/**
 * DailyMissionsCard Component
 *
 * Checklist-style daily missions. Completion detected via direct Sui RPC
 * queries (not the points scanner pipeline). Checks ALL registered wallets
 * for the account so missions completed on any wallet count.
 * Faucet claim has instant optimistic checkmark via ClaimAllButton onSuccess.
 */

import { FC, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/features/auth";
import { OuterBox, Spinner } from "@/components/ui";
import { ClaimAllButton } from "@nasun/wallet-ui";
import { useDailyMissions } from "@/hooks/useDailyMissions";
import { useGovernanceMission } from "@/hooks/useGovernanceMission";
import { useWalletRegistration } from "./hooks/useWalletRegistration";
import { trackCrossAppNav, withCrossAppParam } from "@/lib/analytics";

interface DailyMissionsCardProps {
  className?: string;
  bare?: boolean;
}

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

interface Mission {
  id: string;
  label: string;
  description: string;
  points: number;
  showFaucet?: boolean;
  comingSoon?: boolean;
  externalUrl?: string;
  /** Mission no longer credited by the scanner; shown for transparency
   *  during the my-account → uju migration window. */
  deprecated?: boolean;
}

// Mission ids must match useDailyMissions.ts MissionId union exactly. PR3a
// renamed pado-{lottery,scratchcard,games} → gostop-{lottery,scratchcard,
// numbermatch} and split gostop into 5 separate categories. PR3b removed
// chat from the daily-mission UI. This list mirrors useDailyMissions
// detection so checkboxes track what the scanner actually credits.
const MISSIONS: Mission[] = [
  {
    id: "faucet",
    label: "Claim Tokens",
    description: "Use the faucet to get free test tokens",
    points: 1,
    showFaucet: true,
  },
  {
    id: "wallet-transfer",
    label: "Send Tokens",
    description: "Transfer tokens to another wallet",
    points: 1,
  },
  {
    id: "pado-dex",
    label: "Spot Trade",
    description: "Place a trade on the DEX orderbook",
    points: 2,
    externalUrl: "https://pado.finance/trade",
  },
  {
    id: "gostop-lottery",
    label: "Buy Lottery Ticket",
    description: "Pick 5 numbers and try your luck",
    points: 1,
    externalUrl: "https://gostop.app/lottery",
  },
  {
    id: "gostop-scratchcard",
    label: "Play Scratch Card",
    description: "Scratch and win instant prizes",
    points: 1,
    externalUrl: "https://gostop.app/scratch",
  },
  {
    id: "gostop-numbermatch",
    label: "Play Number Match",
    description: "Pick numbers for a quick game",
    points: 1,
    externalUrl: "https://gostop.app/numbermatch",
  },
  {
    id: "chat",
    label: "Chat",
    description: "Say something in Nasun or Pado chat room",
    points: 1,
    deprecated: true,
  },
];

export const DailyMissionsCard: FC<DailyMissionsCardProps> = ({
  className = "",
  bare = false,
}) => {
  const { user } = useAuth();
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(new Set());
  const { registeredWallets } = useWalletRegistration();

  // Collect all valid wallet addresses for this account
  const allWalletAddresses = useMemo(() => {
    const addrs = new Set<string>();
    // Primary nasun wallet
    const primary =
      user?.linkedAccounts?.["nasun wallet"]?.walletAddress ??
      user?.walletAddress;
    if (primary && SUI_ADDRESS_RE.test(primary)) addrs.add(primary);
    // All registered wallets
    for (const w of registeredWallets) {
      if (SUI_ADDRESS_RE.test(w.walletAddress)) addrs.add(w.walletAddress);
    }
    return [...addrs];
  }, [user, registeredWallets]);

  const { completedMissions, isLoading, refetch } = useDailyMissions(
    user?.identityId,
    allWalletAddresses,
  );

  const {
    hasUnvotedProposal,
    unvotedCount,
    isLoading: isGovLoading,
  } = useGovernanceMission();

  const isCompleted = useCallback(
    (mission: Mission) => {
      if (mission.deprecated) return false;
      return (
        completedMissions.has(mission.id as any) ||
        localCompleted.has(mission.id)
      );
    },
    [completedMissions, localCompleted],
  );

  // Build active missions list: static missions + conditional governance item
  const activeMissions = useMemo(() => {
    const base = MISSIONS.filter((m) => !m.comingSoon);
    if (hasUnvotedProposal) {
      base.push({
        id: "governance-vote",
        label: `Vote on Proposal${unvotedCount > 1 ? "s" : ""}`,
        description: `${unvotedCount} active proposal${unvotedCount > 1 ? "s" : ""} awaiting your vote`,
        points: 1,
        externalUrl: "/network/governance",
      });
    }
    return base;
  }, [hasUnvotedProposal, unvotedCount]);

  // Deprecated missions don't count toward completion progress.
  const trackedMissions = useMemo(
    () => activeMissions.filter((m) => !m.deprecated),
    [activeMissions],
  );

  const completedCount = useMemo(
    () => trackedMissions.filter((m) => isCompleted(m)).length,
    [trackedMissions, isCompleted],
  );

  const handleFaucetSuccess = useCallback(() => {
    setLocalCompleted((prev) => new Set(prev).add("faucet"));
    refetch();
  }, [refetch]);

  const Wrapper = bare
    ? ({ children }: { children: React.ReactNode }) => (
        <div
          className={`border border-dashed border-nasun-white/10 rounded-lg p-4 ${className}`}
        >
          {children}
        </div>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <OuterBox color="w2" padding="sm" className={className}>
          {children}
        </OuterBox>
      );

  if (isLoading) {
    return (
      <Wrapper>
        <h6 className="text-nasun-white text-sm font-medium mb-4">
          Daily Missions
        </h6>
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h6 className="text-nasun-white text-sm font-medium">
            Daily Missions
          </h6>
          <p className="text-sm text-nasun-white/80 mt-0.5">
            {completedCount}/{trackedMissions.length} completed
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-nasun-c6/50 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{
            width: `${trackedMissions.length > 0 ? (completedCount / trackedMissions.length) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {activeMissions.map((mission, i) => {
          const completed =
            !mission.comingSoon && !mission.deprecated && isCompleted(mission);
          const muted = mission.comingSoon || mission.deprecated;
          return (
            <div
              key={mission.id}
              className={`flex items-start gap-3 ${mission.deprecated ? "opacity-60" : ""}`}
            >
              {/* Circle checkbox */}
              <div
                className={`shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  completed
                    ? "bg-green-500 border-green-500"
                    : muted
                      ? "border-nasun-white/60"
                      : "border-nasun-white/80"
                }`}
              >
                {completed && (
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    completed
                      ? "text-nasun-white/80 line-through"
                      : muted
                        ? "text-nasun-white/70"
                        : "text-nasun-white"
                  }`}
                >
                  {i + 1}.{" "}
                  {mission.externalUrl && !mission.deprecated ? (
                    <a
                      href={
                        mission.externalUrl.startsWith("https://pado.finance")
                          ? withCrossAppParam(mission.externalUrl, "nasun")
                          : mission.externalUrl
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline inline-flex items-center gap-1"
                      onClick={() => {
                        if (
                          mission.externalUrl?.startsWith(
                            "https://pado.finance",
                          )
                        ) {
                          const path = new URL(mission.externalUrl).pathname;
                          trackCrossAppNav("pado", path);
                        }
                      }}
                    >
                      {mission.label}
                      <svg
                        className="w-3 h-3 inline-block opacity-60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  ) : (
                    mission.label
                  )}
                  {mission.comingSoon && (
                    <span className="ml-2 text-sm font-semibold px-1.5 py-0.5 rounded-full bg-nasun-white/10 text-nasun-white/80">
                      Coming Soon
                    </span>
                  )}
                  {mission.deprecated && (
                    <span className="ml-2 text-sm font-semibold px-1.5 py-0.5 rounded-full bg-nasun-c1/20 text-nasun-c1">
                      Deprecated
                    </span>
                  )}
                  {!mission.deprecated && (
                    <span className="ml-2 text-sm font-mono text-nasun-white/80">
                      +{mission.points}
                    </span>
                  )}
                </p>
                {!completed && !mission.comingSoon && !mission.deprecated && (
                  <p className="text-sm text-nasun-white/80 mt-0.5">
                    {mission.description}
                  </p>
                )}
                {mission.deprecated && (
                  <p className="text-sm text-nasun-white/60 mt-0.5">
                    No longer credited.
                  </p>
                )}
              </div>

              {/* Faucet claim button */}
              {mission.showFaucet && !completed && (
                <div className="shrink-0 w-44">
                  <ClaimAllButton persistent onSuccess={handleFaucetSuccess} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Wrapper>
  );
};
