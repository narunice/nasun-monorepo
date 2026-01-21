/**
 * GovernanceCard Component
 *
 * Compact governance activity card for the Bento Grid layout.
 * Shows voting power and recent votes.
 */

import { FC } from "react";
import { Link } from "react-router-dom";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useVotingPower } from "@/features/governance/hooks/useVotingPower";
import { useDelegation } from "@/features/governance/hooks/useDelegation";
import { useVoteHistory } from "@/features/governance/hooks/useVoteHistory";
import { OuterBox } from "@/components/ui";
import { StatCard } from "@/components/ui/StatCard";

interface GovernanceCardProps {
  className?: string;
}

export const GovernanceCard: FC<GovernanceCardProps> = ({ className = "" }) => {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;

  const { votingPower, nftVerification } = useVotingPower();
  const { delegationState } = useDelegation();
  const { history, stats, isLoading } = useVoteHistory(3);

  // Calculate voting power components
  const basePower = votingPower?.leaderboardScore || 1;
  const nftBonus = nftVerification?.nftBonus || 0;
  const delegatedPower = delegationState?.delegatorCount ? delegationState.delegatorCount * 100 : 0;
  const totalPower = basePower + nftBonus + delegatedPower;

  if (!isConnected) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">GOVERNANCE</h5>
        <div className="flex flex-col items-center justify-center py-4 gap-3">
          <p className="text-nasun-white/50 text-center">
            Connect Nasun Wallet to view governance activity
          </p>
        </div>
      </OuterBox>
    );
  }

  if (isLoading) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">GOVERNANCE</h5>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-nasun-c3 border-t-transparent" />
        </div>
      </OuterBox>
    );
  }

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      <h5 className="font-medium uppercase text-nasun-white mb-4">GOVERNANCE</h5>
      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Voting Power" value={totalPower.toLocaleString()} className="!p-3" />
        <StatCard
          label="Participation"
          value={`${stats.participationRate.toFixed(0)}%`}
          className="!p-3"
        />
      </div>

      {/* Recent Votes */}
      <div className="space-y-2">
        <h6 className="font-medium text-nasun-white/60 uppercase">Recent Votes</h6>
        {history.length > 0 ? (
          <div className="space-y-2">
            {history.map((vote) => (
              <div key={vote.proposalId} className="flex items-center justify-between">
                <span className="truncate max-w-[150px] text-nasun-white/80">
                  {vote.proposalTitle}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-sm font-medium ${
                    vote.voteYes ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {vote.voteYes ? "Yes" : "No"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-nasun-white/50">No votes yet</p>
        )}
      </div>

      {/* View All Link */}
      <Link
        to="/network/governance"
        className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-nasun-c5/30 text-nasun-c3 hover:text-nasun-c4 transition-colors"
      >
        View All
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </OuterBox>
  );
};

export default GovernanceCard;
