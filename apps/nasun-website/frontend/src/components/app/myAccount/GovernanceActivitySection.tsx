/**
 * GovernanceActivitySection Component
 *
 * Displays user's governance participation summary in My Account page.
 * Shows voting power, participation rate, and recent vote history.
 * Uses SectionLayout and Table components for design consistency.
 */

import { FC } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useVotingPower } from "@/features/governance/hooks/useVotingPower";
import { useDelegation } from "@/features/governance/hooks/useDelegation";
import { useVoteHistory } from "@/features/governance/hooks/useVoteHistory";
import { SectionLayout } from "@/components/layout/SectionLayout";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from "@/components/ui/table";

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

  const renderContent = () => {
    if (!isConnected) {
      return (
        <div className="text-center py-6">
          <p className="text-nasun-white/70 mb-4">
            Connect your wallet to view governance activity
          </p>
          <WalletConnect />
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c3 border-t-transparent" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Stats Summary Table */}
        <Table variant="c3">
          <TableBody>
            <TableRow variant="c3">
              <TableCell align="center" className="w-[35%]">
                Voting Power
              </TableCell>
              <TableCell>
                <span className="text-nasun-c3 font-semibold">
                  {totalPower.toLocaleString()}
                </span>
                {nftBonus > 0 && (
                  <span className="text-nasun-c3/70 ml-2">(+{nftBonus} NFT)</span>
                )}
              </TableCell>
            </TableRow>
            <TableRow variant="c3" isLast>
              <TableCell align="center" className="w-[35%]">
                Participation
              </TableCell>
              <TableCell>
                <span className="font-semibold">{stats.votedProposals}</span>
                <span className="text-nasun-white/50 ml-2">
                  voted ({stats.participationRate.toFixed(0)}% rate)
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {/* Recent Votes Table */}
        {history.length > 0 ? (
          <div>
            <h4 className="mb-3">Recent Votes</h4>
            <Table variant="c3">
              <TableHeader variant="c3">
                <TableRow variant="c3">
                  <TableHead>Proposal</TableHead>
                  <TableHead align="center">Vote</TableHead>
                  <TableHead align="right">Power</TableHead>
                  <TableHead align="right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((vote, index) => (
                  <TableRow
                    key={vote.proposalId}
                    variant="c3"
                    isLast={index === history.length - 1}
                  >
                    <TableCell>
                      <span className="max-w-[200px] truncate block">
                        {vote.proposalTitle}
                      </span>
                    </TableCell>
                    <TableCell align="center">
                      <VoteBadge voteYes={vote.voteYes} />
                    </TableCell>
                    <TableCell align="right">
                      {vote.votingPower.toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      <StatusBadge status={vote.proposalStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center py-4 text-nasun-white/50">No votes yet</p>
        )}

        {/* View All Link */}
        <div className="pt-4 border-t border-nasun-c5/30">
          <Link
            to="/protocol/governance"
            className="flex items-center justify-center gap-2 text-nasun-c3 hover:text-nasun-c4 transition-colors"
          >
            View All in Governance
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    );
  };

  return (
    <SectionLayout title="Governance Activity" titleAs="h3" className={className}>
      {renderContent()}
    </SectionLayout>
  );
};

// Helper component for vote badge
const VoteBadge: FC<{ voteYes: boolean }> = ({ voteYes }) => (
  <span
    className={`px-2 py-1 rounded text-xs font-medium ${
      voteYes ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
    }`}
  >
    {voteYes ? "Yes" : "No"}
  </span>
);

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
