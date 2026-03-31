/**
 * DailyMissionsCard Component
 *
 * Checklist-style daily missions. Completion detected via direct Sui RPC
 * queries (not the points scanner pipeline). Two RPC calls per poll:
 * queryEvents({Sender}) + queryTransactionBlocks({FromAddress}).
 * Faucet claim has instant optimistic checkmark via ClaimAllButton onSuccess.
 */

import { FC, useState, useCallback } from "react";
import { useAuth } from "@/features/auth";
import { OuterBox, Spinner } from "@/components/ui";
import { ClaimAllButton } from "@nasun/wallet-ui";
import { useDailyMissions } from "@/hooks/useDailyMissions";

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
}

const MISSIONS: Mission[] = [
  { id: "faucet", label: "Claim Tokens", description: "Use the faucet to get free test tokens", points: 1, showFaucet: true },
  { id: "wallet-transfer", label: "Send Tokens", description: "Transfer tokens to another wallet", points: 1 },
  { id: "pado-dex", label: "Spot Trade", description: "Place a trade on the DEX orderbook", points: 2, comingSoon: true },
  { id: "pado-lottery", label: "Buy Lottery Ticket", description: "Pick 5 numbers and try your luck", points: 1, comingSoon: true },
  { id: "pado-scratchcard", label: "Play Scratch Card", description: "Scratch and win instant prizes", points: 1, comingSoon: true },
  { id: "pado-games", label: "Play Quick Pick", description: "Auto-pick numbers for a quick game", points: 1, comingSoon: true },
];

export const DailyMissionsCard: FC<DailyMissionsCardProps> = ({ className = "", bare = false }) => {
  const { user } = useAuth();
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(new Set());

  const nasunWalletAddress =
    user?.linkedAccounts?.["nasun wallet"]?.walletAddress ?? user?.walletAddress;
  const hasValidAddress = nasunWalletAddress && SUI_ADDRESS_RE.test(nasunWalletAddress);

  const { completedMissions, isLoading, refetch } = useDailyMissions(
    hasValidAddress ? nasunWalletAddress : undefined,
  );

  const isCompleted = useCallback(
    (id: string) => completedMissions.has(id as any) || localCompleted.has(id),
    [completedMissions, localCompleted],
  );
  const activeMissions = MISSIONS.filter((m) => !m.comingSoon);
  const completedCount = activeMissions.filter((m) => isCompleted(m.id)).length;

  const handleFaucetSuccess = useCallback(() => {
    setLocalCompleted((prev) => new Set(prev).add("faucet"));
    refetch();
  }, [refetch]);

  const Wrapper = bare
    ? ({ children }: { children: React.ReactNode }) => <div className={`border border-dashed border-nasun-white/10 rounded-lg p-4 ${className}`}>{children}</div>
    : ({ children }: { children: React.ReactNode }) => <OuterBox color="c5" padding="sm" className={className}>{children}</OuterBox>;

  if (isLoading) {
    return (
      <Wrapper>
        <h6 className="text-nasun-white text-sm font-medium mb-4">Daily Missions</h6>
        <div className="flex items-center justify-center py-8"><Spinner /></div>
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
          <p className="text-xs text-nasun-white/40 mt-0.5">
            {completedCount}/{activeMissions.length} completed
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-nasun-c6/50 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${activeMissions.length > 0 ? (completedCount / activeMissions.length) * 100 : 0}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {MISSIONS.map((mission, i) => {
          const completed = !mission.comingSoon && isCompleted(mission.id);
          return (
            <div key={mission.id} className="flex items-start gap-3">
              {/* Circle checkbox */}
              <div className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                completed
                  ? "bg-green-500 border-green-500"
                  : mission.comingSoon
                    ? "border-nasun-white/10"
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
                  completed
                    ? "text-nasun-white/40 line-through"
                    : mission.comingSoon
                      ? "text-nasun-white/25"
                      : "text-nasun-white"
                }`}>
                  {i + 1}. {mission.label}
                  {mission.comingSoon && (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-nasun-white/5 text-nasun-white/20">
                      Coming Soon
                    </span>
                  )}
                  <span className="ml-2 text-xs font-mono text-nasun-white/25">+{mission.points}</span>
                </p>
                {!completed && !mission.comingSoon && (
                  <p className="text-xs text-nasun-white/40 mt-0.5">{mission.description}</p>
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
