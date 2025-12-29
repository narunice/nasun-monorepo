/**
 * GovernanceActivitySection Component
 *
 * Displays user's governance participation summary in My Account page.
 * Shows voting power, participation rate, and recent vote history.
 */

import { FC } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useVotingPower } from "@/features/governance/hooks/useVotingPower";
import { useDelegation } from "@/features/governance/hooks/useDelegation";
import { useVoteHistory } from "@/features/governance/hooks/useVoteHistory";

interface GovernanceActivitySectionProps {
  className?: string;
}

export const GovernanceActivitySection: FC<GovernanceActivitySectionProps> = ({
  className = "",
}) => {
  const { status, account } = useWallet();
  const isConnected = status === "unlocked" && account;

  const { votingPower, nftVerification } = useVotingPower();
  const { delegationState } = useDelegation();
  const { history, stats, isLoading } = useVoteHistory(5);

  // Calculate voting power components
  const basePower = votingPower?.leaderboardScore || 1;
  const nftBonus = nftVerification?.nftBonus || 0;
  const delegatedPower = delegationState?.delegatorCount
    ? delegationState.delegatorCount * 100
    : 0;
  const totalPower = basePower + nftBonus + delegatedPower;

  return (
    <div className={`mt-6 ${className}`}>
      <h2 className="text-xl font-semibold text-nasun-white mb-4">
        Governance Activity
      </h2>

      <div className="bg-nasun-c6 border border-nasun-c5/50 rounded-xl p-6">
        {!isConnected ? (
          <div className="text-center py-6">
            <p className="text-nasun-white/70 mb-4">
              Connect your wallet to view governance activity
            </p>
            <WalletConnect />
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c3 border-t-transparent"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* Voting Power Card */}
              <div className="bg-nasun-black/30 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-nasun-c3">
                  {totalPower.toLocaleString()}
                </div>
                <div className="text-sm text-nasun-white/50 mt-1">Voting Power</div>
                {nftBonus > 0 && (
                  <div className="text-xs text-nasun-c3 mt-1">+{nftBonus} NFT</div>
                )}
              </div>

              {/* Participation Card */}
              <div className="bg-nasun-black/30 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-nasun-white">
                  {stats.votedProposals}
                </div>
                <div className="text-sm text-nasun-white/50 mt-1">Proposals Voted</div>
                <div className="text-xs text-nasun-white/40 mt-1">
                  {stats.participationRate.toFixed(0)}% rate
                </div>
              </div>
            </div>

            {/* Recent Votes */}
            {history.length > 0 ? (
              <div>
                <h4 className="text-sm font-medium text-nasun-white/70 mb-3">
                  Recent Votes
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-nasun-white/50">
                        <th className="pb-2 font-medium">Proposal</th>
                        <th className="pb-2 font-medium text-center">Vote</th>
                        <th className="pb-2 font-medium text-right">Power</th>
                        <th className="pb-2 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nasun-c5/20">
                      {history.map((vote) => (
                        <tr key={vote.proposalId}>
                          <td className="py-3 text-nasun-white">
                            <span className="max-w-[200px] truncate block">
                              {vote.proposalTitle}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                vote.voteYes
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {vote.voteYes ? "Yes" : "No"}
                            </span>
                          </td>
                          <td className="py-3 text-right text-nasun-white/70">
                            {vote.votingPower.toLocaleString()}
                          </td>
                          <td className="py-3 text-right">
                            <StatusBadge status={vote.proposalStatus} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-nasun-white/50">No votes yet</p>
              </div>
            )}

            {/* View All Link */}
            <div className="pt-4 border-t border-nasun-c5/30">
              <Link
                to="/protocol/governance"
                className="flex items-center justify-center gap-2 text-nasun-c3 hover:text-nasun-c4 transition-colors"
              >
                View All in Governance
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper component for status badge
const StatusBadge: FC<{ status: string }> = ({ status }) => {
  const styles = {
    Active: "bg-blue-500/20 text-blue-400",
    Passed: "bg-green-500/20 text-green-400",
    Failed: "bg-red-500/20 text-red-400",
    Delisted: "bg-gray-500/20 text-gray-400",
  };

  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${
        styles[status as keyof typeof styles] || styles.Active
      }`}
    >
      {status}
    </span>
  );
};

export default GovernanceActivitySection;
