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
import { Title } from "@/components/ui/Title";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";

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
        <div className="relative">
          <Table variant="c3">
            <TableBody>
              <TableRow variant="c3" isLast>
                <TableCell className="w-full">
                  <p className="py-2 text-center text-nasun-white/70">
                    Connect your wallet to view governance activity
                  </p>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="absolute top-1/2 right-4 -translate-y-1/2 z-[9999]">
            <WalletConnect />
          </div>
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
      <Table variant="c3">
          <TableBody>
            {/* Voting Power */}
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

          {/* Participation */}
          <TableRow variant="c3">
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

          {/* Recent Votes */}
          <TableRow variant="c3">
            <TableCell align="center" className="w-[35%]">
              Recent Votes
            </TableCell>
            <TableCell>
              {history.length > 0 ? (
                <div className="space-y-2">
                  {history.map((vote) => (
                    <div key={vote.proposalId} className="flex items-center gap-3">
                      <span className="flex-1 truncate max-w-[200px]">
                        {vote.proposalTitle}
                      </span>
                      <VoteBadge voteYes={vote.voteYes} />
                      <StatusBadge status={vote.proposalStatus} />
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-nasun-white/50">No votes yet</span>
              )}
            </TableCell>
          </TableRow>

          {/* View All Link */}
          <TableRow variant="c3" isLast>
            <TableCell colSpan={2}>
              <Link
                to="/protocol/governance"
                className="flex items-center justify-center gap-2 text-nasun-c3 hover:text-nasun-c4 transition-colors"
              >
                View All in Governance
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  };

  return (
    <SectionLayout className={className}>
      {/* Title row with optional WalletConnect */}
      <div className="flex items-center justify-between mb-1 md:mb-2 lg:mb-3 xl:mb-4">
        <Title as="h3" align="left" className="!mb-0">
          GOVERNANCE ACTIVITY
        </Title>
        {isConnected && <WalletConnect />}
      </div>
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
