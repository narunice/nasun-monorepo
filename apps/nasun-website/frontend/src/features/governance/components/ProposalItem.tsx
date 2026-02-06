import { useSuiClientQuery } from "@mysten/dapp-kit";
import { FC, useState } from "react";
import { ArrowRight } from "lucide-react";
import { EcText } from "@/components/ui/Shared";
import { VoteNft } from "../types/voting";
import { VoteModal } from "./VoteModal";
import { useProposalType } from "../hooks/useProposalType";
import { OuterBox, Button } from "@/components/ui";
import { useNavigate } from "react-router-dom";
import { parseProposal, isUnixTimeExpired, formatTimeRemaining, getStatusBadge } from "../utils/proposalHelpers";

const DESC_TRUNCATE_LENGTH = 300;

interface ProposalItemsProps {
  id: string;
  filter?: "all" | "active" | "expired";
  voteNft: VoteNft | undefined;
  onVoteTxSuccess: () => void | Promise<void>;
}

export const ProposalItem: FC<ProposalItemsProps> = ({ id, filter = "all", voteNft, onVoteTxSuccess }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const {
    data: dataResponse,
    refetch: refetchProposal,
    error,
    isPending,
  } = useSuiClientQuery("getObject", {
    id,
    options: {
      showContent: true,
    },
  });

  // Get proposal type from registry
  const { proposalType, isLoading: isTypeLoading } = useProposalType(id);

  if (isPending || isTypeLoading) return <EcText centered text="Loading..." />;
  if (error) return <EcText isError text={`Error: ${error.message}`} />;
  if (!dataResponse.data) return null;

  const proposal = parseProposal(dataResponse.data, proposalType);

  if (!proposal) return <EcText text="No data found" />;

  const expiration = proposal.expiration;
  const isDelisted = proposal.status.variant === "Delisted";
  const isExpired = isUnixTimeExpired(expiration) || isDelisted;

  // Apply filter
  if (filter === "active" && isExpired) return null;
  if (filter === "expired" && !isExpired) return null;

  // Determine pass/fail for expired proposals
  const yesCount = Number(proposal.yesVotes) || 0;
  const noCount = Number(proposal.noVotes) || 0;
  const totalVotes = yesCount + noCount;
  const yesPercent = totalVotes > 0 ? (yesCount / totalVotes) * 100 : 50;
  const hasPassed = yesCount > noCount;

  const bgClass = isExpired ? "bg-nasun-c6/30" : "";

  const handleCardClick = () => {
    navigate(`/network/governance/proposal/${id}`);
  };

  const statusBadge = getStatusBadge(isDelisted, isExpired, hasPassed);
  const isLongDescription = proposal.description.length > DESC_TRUNCATE_LENGTH;

  return (
    <>
      <OuterBox
        color="w2"
        padding="md"
        className={`flex flex-col relative h-full min-h-[320px] transition-all duration-200 ${bgClass} cursor-pointer ${!isExpired ? "hover:border-nasun-c4" : "hover:border-nasun-white/20"}`}
        onClick={handleCardClick}
      >
        {/* Header: Badges + Title */}
        <div className="mb-3">
          {/* Badges row: Type (left) + Status + NFT (right) */}
          <div className="flex justify-between items-center mb-2 -mt-2 -mx-2">
            <div className="flex items-center gap-2">
              {proposal.proposalType === "Poll" ? (
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded-full bg-nasun-c4/20 text-nasun-c4 border border-nasun-c4/30">
                  Poll
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded-full bg-nasun-c1/20 text-nasun-c1 border border-nasun-c1/30">
                  Governance
                </span>
              )}
              <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-full border ${statusBadge.bg} ${statusBadge.text}`}>
                {statusBadge.label}
              </span>
            </div>
            {!!voteNft && (
              <div title="You have voted">
                <img
                  className="w-6 h-6 rounded-full border border-nasun-c1/50"
                  src={voteNft?.url}
                  alt="Vote NFT"
                />
              </div>
            )}
          </div>
          <h6 className={`${isExpired ? "text-nasun-white/50" : "text-nasun-white"}`}>
            {proposal.title}
          </h6>
        </div>

        {/* Description */}
        <div className="flex-1 mb-4">
          <p className={`${isExpired ? "text-nasun-white/50" : "text-nasun-white/80"} line-clamp-6`}>
            {proposal.description}
          </p>
          {isLongDescription && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/network/governance/proposal/${id}`);
              }}
              className="mt-1 text-xs text-nasun-c4 hover:text-nasun-c5 flex items-center gap-1"
            >
              Read More <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Footer: Progress Bar + Time */}
        <div className="mt-auto pt-3 border-t border-nasun-white/5 space-y-2">
          {/* Vote Progress Bar */}
          <div>
            <div className={`w-full h-2 rounded-full overflow-hidden ${isExpired ? "bg-red-500/15" : "bg-red-500/30"}`}>
              <div
                className={`h-full transition-all ${isExpired ? "bg-green-500/60" : "bg-green-500"}`}
                style={{ width: `${yesPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className={isExpired ? "text-nasun-white/30" : "text-green-400"}>
                Yes {yesPercent.toFixed(0)}% ({proposal.yesVotes})
              </span>
              <span className={isExpired ? "text-nasun-white/30" : "text-red-400"}>
                No {(100 - yesPercent).toFixed(0)}% ({proposal.noVotes})
              </span>
            </div>
          </div>

          {/* Countdown / Date */}
          <div className="flex items-center justify-between">
            <p className={`text-xs ${isExpired ? "text-nasun-white/30" : "text-nasun-white/50"}`}>
              {isDelisted ? "Delisted" : formatTimeRemaining(expiration)}
            </p>
          </div>
        </div>

        {/* Vote Button */}
        {!isExpired && (
          <Button
            variant="c4"
            onClick={(e) => {
              e.stopPropagation();
              setIsModalOpen(true);
            }}
            className="mt-3 w-full"
            disabled={!!voteNft}
          >
            {voteNft ? "Voted" : "Vote"}
          </Button>
        )}
      </OuterBox>

      <VoteModal
        proposal={proposal}
        hasVoted={!!voteNft}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onVote={async () => {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await refetchProposal();
          await onVoteTxSuccess();
          setIsModalOpen(false);
        }}
      />
    </>
  );
};
