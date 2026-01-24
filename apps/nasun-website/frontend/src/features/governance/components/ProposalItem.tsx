import { useSuiClientQuery } from "@mysten/dapp-kit";
import { FC, useEffect, useRef, useState } from "react";
import { EcText } from "@/components/ui/Shared";
import { SuiObjectData } from "@mysten/sui/client";
import { Proposal, VoteNft, ProposalFields, ProposalType } from "../types/voting";
import { VoteModal } from "./VoteModal";
import { useProposalType } from "../hooks/useProposalType";
import { toast } from "react-toastify";
import { OuterBox, Button } from "@/components/ui";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ProposalItemsProps {
  id: string;
  voteNft: VoteNft | undefined;
  onVoteTxSuccess: () => void | Promise<void>;
}

export const ProposalItem: FC<ProposalItemsProps> = ({ id, voteNft, onVoteTxSuccess }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      // Temporarily remove clamp to measure full content height
      const origClamp = el.style.webkitLineClamp;
      const origOverflow = el.style.overflow;
      el.style.webkitLineClamp = "unset";
      el.style.overflow = "visible";
      const fullHeight = el.scrollHeight;
      el.style.webkitLineClamp = origClamp;
      el.style.overflow = origOverflow;
      setIsClamped(fullHeight > el.clientHeight + 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [dataResponse]);

  if (isPending || isTypeLoading) return <EcText centered text="Loading..." />;
  if (error) return <EcText isError text={`Error: ${error.message}`} />;
  if (!dataResponse.data) return null;

  const proposal = parseProposal(dataResponse.data, proposalType);

  if (!proposal) return <EcText text="No data found" />;

  const expiration = proposal.expiration;
  const isDelisted = proposal.status.variant === "Delisted";
  const isExpired = isUnixTimeExpired(expiration) || isDelisted;

  // Determine styling based on state
  const bgClass = isExpired ? "bg-nasun-c6/30" : ""; // Additional dimming for expired

  const handleCardClick = () => {
    if (isExpired) {
      toast.info(isDelisted ? "This proposal has been delisted" : "Voting period has ended", {
        autoClose: 2000,
      });
    } else {
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <OuterBox
        color="w2"
        padding="md"
        className={`flex flex-col relative h-full min-h-[320px] transition-all duration-200 ${bgClass} ${!isExpired ? "cursor-pointer hover:border-nasun-c4" : "cursor-not-allowed border-nasun-white/10"}`}
        onClick={handleCardClick}
      >
        {/* Header: Badges + Title */}
        <div className="mb-3">
          {/* Badges row: Type (left) + NFT (right) */}
          <div className="flex justify-between items-center mb-2 -mt-2 -mx-2">
            <div>
              {proposal.proposalType === "Poll" ? (
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded-full bg-nasun-c4/20 text-nasun-c4 border border-nasun-c4/30">
                  Poll
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded-full bg-nasun-c1/20 text-nasun-c1 border border-nasun-c1/30">
                  Governance
                </span>
              )}
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

        {/* Description with Expand/Collapse */}
        <div className="flex-1 mb-4 relative" onClick={(e) => e.stopPropagation()}>
          <div
            ref={descRef}
            className={`${isExpired ? "text-nasun-white/50" : "text-nasun-white/80"} ${isExpanded ? "" : "line-clamp-6"}`}
          >
            <p>{proposal.description}</p>
          </div>
          {(isClamped || isExpanded) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="mt-1 text-xs text-nasun-c4 hover:text-nasun-c5 flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  Show Less <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  Read More <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>

        {/* Footer: Votes and Date */}
        <div className="mt-auto pt-3 border-t border-nasun-white/5 flex items-center justify-between">
          <div className="flex space-x-4 text-sm font-medium">
            <div
              className={`flex items-center gap-1.5 ${isExpired ? "text-nasun-white/30" : "text-green-400"}`}
            >
              <span>👍</span>
              <span>{proposal.yesVotes}</span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${isExpired ? "text-nasun-white/30" : "text-red-400"}`}
            >
              <span>👎</span>
              <span>{proposal.noVotes}</span>
            </div>
          </div>
          <p className={`text-xs ${isExpired ? "text-nasun-white/30" : "text-nasun-white/50"}`}>
            {isDelisted ? "Delisted" : formatUnixTime(expiration)}
          </p>
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
          // Wait for blockchain to reflect the vote, then refetch proposal
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await refetchProposal();
          await onVoteTxSuccess();
          setIsModalOpen(false);
        }}
      />
    </>
  );
};

function parseProposal(data: SuiObjectData, proposalType: ProposalType): Proposal | null {
  if (data.content?.dataType !== "moveObject") return null;

  const fields = data.content.fields as ProposalFields;

  // Required field validation (using Move contract field names)
  if (!fields.title || !fields.description || !fields.status || !fields.creator || !fields.voters) {
    console.error("Missing required proposal fields", fields);
    return null;
  }

  return {
    id: { id: data.objectId }, // Use objectId from SuiObjectData
    title: fields.title,
    description: fields.description,
    status: fields.status,
    proposalType,
    // Use total voting power instead of vote count
    yesVotes: (Number(fields.total_power_yes) || 0).toString(),
    noVotes: (Number(fields.total_power_no) || 0).toString(),
    expiration: Number(fields.expiration),
    creator: fields.creator,
    voters: fields.voters?.fields?.id?.id || "",
  };
}

function isUnixTimeExpired(unixTimeMs: number) {
  return new Date(unixTimeMs) < new Date();
}

function formatUnixTime(timestampMs: number) {
  if (isUnixTimeExpired(timestampMs)) {
    return "Expired";
  }

  return new Date(timestampMs).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
