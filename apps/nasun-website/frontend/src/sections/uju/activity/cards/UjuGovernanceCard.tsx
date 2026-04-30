import { FC } from "react";
import { Link } from "react-router-dom";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useVotingPower } from "@/features/governance/hooks/useVotingPower";
import { useVoteHistory } from "@/features/governance/hooks/useVoteHistory";
import { Spinner } from "@/components/ui";
import { UjuCard, UjuSectionHeader, UjuStat } from "../../shared";

interface UjuGovernanceCardProps {
  className?: string;
}

export const UjuGovernanceCard: FC<UjuGovernanceCardProps> = ({
  className = "",
}) => {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;

  const { votingPower } = useVotingPower();
  const { history, isLoading } = useVoteHistory(3);

  const totalPower = votingPower?.totalVotingPower || 10;

  if (!isConnected) {
    return (
      <UjuCard className={className}>
        <UjuSectionHeader
          accent
          title="Governance"
          subtitle="Connect Nasun Wallet to view governance activity"
        />
        <div className="flex flex-col items-center justify-center py-4">
          <p className="text-uju-secondary text-center">
            Wallet connection required.
          </p>
        </div>
      </UjuCard>
    );
  }

  if (isLoading) {
    return (
      <UjuCard className={className}>
        <UjuSectionHeader accent title="Governance" />
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </UjuCard>
    );
  }

  return (
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title="Governance"
        subtitle="Proposals you've voted on"
      />

      {/* Stats Row */}
      <div className="mb-8">
        <UjuStat
          label="Voting Power"
          value={totalPower.toLocaleString()}
          tone="cyan"
        />
        {votingPower?.breakdown && (
          <p className="text-sm font-light text-uju-secondary mt-1 tabular-nums">
            {`= ${votingPower.breakdown.base} (base)`}
            {votingPower.breakdown.xLinked > 0 &&
              ` + ${votingPower.breakdown.xLinked} (X linked)`}
            {votingPower.breakdown.telegram > 0 &&
              ` + ${votingPower.breakdown.telegram} (Telegram)`}
            {votingPower.breakdown.rankBonus > 0 &&
              ` + ${votingPower.breakdown.rankBonus} (rank bonus)`}
          </p>
        )}
      </div>

      {/* Recent Votes */}
      <div className="space-y-4">
        <h6 className="text-sm font-semibold text-uju-secondary uppercase tracking-wider">
          Recent Votes
        </h6>
        {history.length > 0 ? (
          <div className="space-y-3">
            {history.map((vote) => (
              <div
                key={vote.proposalId}
                className="flex items-center justify-between p-3 rounded-xl bg-uju-bg/50 border border-uju-border/30"
              >
                <span className="truncate max-w-[200px] text-uju-primary font-light">
                  {vote.proposalTitle}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-lg text-sm font-normal ${
                    vote.voteYes
                      ? "bg-pado-4/10 text-pado-4"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {vote.voteYes ? "YES" : "NO"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-uju-secondary py-2">No votes yet</p>
        )}
      </div>

      {/* View All Link */}
      <Link
        to="/network/governance"
        className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-uju-border/20 text-pado-2 hover:text-pado-4 transition-colors font-light"
      >
        View All Proposals
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </Link>
    </UjuCard>
  );
};
