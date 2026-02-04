/**
 * ProposalDetailPage
 *
 * Shareable detail page for individual governance proposals.
 * Route: /network/governance/proposal/:proposalId
 */

import { FC, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { VoteNft } from "@/features/governance/types/voting";
import { VoteModal } from "@/features/governance/components/VoteModal";
import { useProposalType } from "@/features/governance/hooks/useProposalType";
import { useVoteNfts } from "@/features/governance/hooks/useVoteNfts";
import { parseProposal, isUnixTimeExpired, formatTimeRemaining, getStatusBadge } from "@/features/governance/utils/proposalHelpers";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox, Button, PageTitle } from "@/components/ui";
import { toast } from "react-toastify";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";

const ProposalDetailPage: FC = () => {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;

  // Validate proposalId before making queries
  const isValidId = proposalId && /^0x[a-fA-F0-9]{64}$/.test(proposalId);

  const {
    data: dataResponse,
    refetch: refetchProposal,
    error,
    isPending,
  } = useSuiClientQuery("getObject", {
    id: proposalId || "",
    options: { showContent: true },
  });

  const { proposalType, isLoading: isTypeLoading } = useProposalType(proposalId!);
  const { data: voteNftsRes, refetch: refetchNfts } = useVoteNfts();

  // Find user's vote NFT for this proposal
  const voteNft = voteNftsRes?.data
    ?.map((obj) => {
      if (obj.data?.content?.dataType !== "moveObject") return null;
      const fields = obj.data.content.fields as { proposal_id: string; url: string; id: { id: string } };
      return { proposalId: fields.proposal_id, url: fields.url, id: fields.id };
    })
    .find((nft): nft is VoteNft => nft?.proposalId === proposalId);

  if (!isValidId) {
    return (
      <SectionLayout className="!max-w-4xl">
        <div className="text-center py-20">
          <p className="text-red-400 mb-4">Invalid proposal ID</p>
          <Button variant="outlineC5" onClick={() => navigate("/network/governance")}>
            Back to Governance
          </Button>
        </div>
      </SectionLayout>
    );
  }

  if (isPending || isTypeLoading) {
    return (
      <SectionLayout className="!max-w-4xl">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c4 border-t-transparent" />
        </div>
      </SectionLayout>
    );
  }

  if (error || !dataResponse?.data) {
    return (
      <SectionLayout className="!max-w-4xl">
        <div className="text-center py-20">
          <p className="text-red-400 mb-4">Proposal not found</p>
          <Button variant="outlineC5" onClick={() => navigate("/network/governance")}>
            Back to Governance
          </Button>
        </div>
      </SectionLayout>
    );
  }

  const proposal = parseProposal(dataResponse.data, proposalType);

  if (!proposal) {
    return (
      <SectionLayout className="!max-w-4xl">
        <div className="text-center py-20">
          <p className="text-red-400">Failed to parse proposal data</p>
        </div>
      </SectionLayout>
    );
  }

  const isDelisted = proposal.status.variant === "Delisted";
  const isExpired = isUnixTimeExpired(proposal.expiration) || isDelisted;

  const yesCount = Number(proposal.yesVotes) || 0;
  const noCount = Number(proposal.noVotes) || 0;
  const totalVotes = yesCount + noCount;
  const yesPercent = totalVotes > 0 ? (yesCount / totalVotes) * 100 : 50;
  const hasPassed = yesCount > noCount;

  const statusBadge = getStatusBadge(isDelisted, isExpired, hasPassed);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("URL copied to clipboard");
  };

  const explorerUrl = import.meta.env.VITE_DEVNET_EXPLORER_URL || "https://explorer.nasun.io/devnet";

  return (
    <SectionLayout className="!max-w-6xl gap-4 !pt-24">
      {/* Top Row: Back Button (left) + Badges (right) */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/network/governance")}
          className="flex items-center gap-2 text-nasun-white/60 hover:text-nasun-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Governance</span>
        </button>
        <div className="flex items-center gap-2">
          {proposal.proposalType === "Poll" ? (
            <span className="px-3 py-1 text-xs uppercase font-bold rounded-full bg-nasun-c4/20 text-nasun-c4 border border-nasun-c4/30">
              Poll
            </span>
          ) : (
            <span className="px-3 py-1 text-xs uppercase font-bold rounded-full bg-nasun-c1/20 text-nasun-c1 border border-nasun-c1/30">
              Governance
            </span>
          )}
          <span className={`px-3 py-1 text-xs uppercase font-bold rounded-full border ${statusBadge.bg} ${statusBadge.text}`}>
            {statusBadge.label}
          </span>
          {voteNft && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              You Voted
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <PageTitle as="h2">{proposal.title}</PageTitle>

      {/* Two-column layout: Description (left) + Sidebar (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* Left: Description */}
        <OuterBox color="w2" padding="md" className="flex flex-col min-h-[300px] max-h-[55vh]">
          <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
            <p className="text-nasun-white/85 whitespace-pre-wrap leading-relaxed">{proposal.description}</p>
          </div>
        </OuterBox>

        {/* Right: Sidebar */}
        <div className="flex flex-col gap-4 lg:min-h-[300px]">
          {/* Vote Results */}
          <OuterBox color="w2" padding="md">
            <h3 className="text-sm font-medium text-nasun-white/60 uppercase tracking-wider mb-3">Vote Results</h3>
            <div className="mb-3">
              <div className={`w-full h-3 rounded-full overflow-hidden ${isExpired ? "bg-red-500/15" : "bg-red-500/30"}`}>
                <div
                  className={`h-full transition-all ${isExpired ? "bg-green-500/60" : "bg-green-500"}`}
                  style={{ width: `${yesPercent}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-sm p-3 text-center">
                <div className="text-xl font-bold text-green-400">{yesPercent.toFixed(1)}%</div>
                <div className="text-xs text-nasun-white/50">Yes</div>
                <div className="text-sm font-medium text-green-400 mt-1">{proposal.yesVotes}</div>
                <div className="text-[10px] text-nasun-white/30">voting power</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-3 text-center">
                <div className="text-xl font-bold text-red-400">{(100 - yesPercent).toFixed(1)}%</div>
                <div className="text-xs text-nasun-white/50">No</div>
                <div className="text-sm font-medium text-red-400 mt-1">{proposal.noVotes}</div>
                <div className="text-[10px] text-nasun-white/30">voting power</div>
              </div>
            </div>
          </OuterBox>

          {/* Details */}
          <OuterBox color="w2" padding="md" className="flex-1">
            <h3 className="text-sm font-medium text-nasun-white/60 uppercase tracking-wider mb-3">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-nasun-white/50">Proposal ID</span>
                <a
                  href={`${explorerUrl}/object/${proposalId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-c4 hover:text-nasun-c5 flex items-center gap-1 font-mono text-xs"
                >
                  {proposalId?.slice(0, 6)}...{proposalId?.slice(-4)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-nasun-white/50">Creator</span>
                <a
                  href={`${explorerUrl}/address/${proposal.creator}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-c4 hover:text-nasun-c5 flex items-center gap-1 font-mono text-xs"
                >
                  {proposal.creator.slice(0, 6)}...{proposal.creator.slice(-4)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-nasun-white/50">Expiration</span>
                <span className="text-nasun-white/80 text-xs">
                  {isDelisted
                    ? "Delisted"
                    : isExpired
                      ? `Ended ${new Date(proposal.expiration).toLocaleString("en-US")}`
                      : formatTimeRemaining(proposal.expiration)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-nasun-white/50">Type</span>
                <span className="text-nasun-white/80 text-xs">
                  {proposal.proposalType === "Poll" ? "Poll (Zero Gas)" : "Governance (Gas Required)"}
                </span>
              </div>
            </div>
          </OuterBox>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {!isExpired && (
              isConnected ? (
                <Button
                  variant="c4"
                  onClick={() => setIsModalOpen(true)}
                  disabled={!!voteNft}
                  className="w-full"
                >
                  {voteNft ? "Already Voted" : "Vote on this Proposal"}
                </Button>
              ) : (
                <div className="flex justify-center">
                  <WalletConnect />
                </div>
              )
            )}
            <Button variant="outlineC5" onClick={handleCopyUrl} className="w-full flex items-center justify-center gap-2">
              <Copy className="w-4 h-4" />
              Share
            </Button>
          </div>
        </div>
      </div>

      <VoteModal
        proposal={proposal}
        hasVoted={!!voteNft}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onVote={async () => {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await refetchProposal();
          for (let i = 0; i < 5; i++) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await refetchNfts();
          }
          setIsModalOpen(false);
        }}
      />
    </SectionLayout>
  );
};

export default ProposalDetailPage;

