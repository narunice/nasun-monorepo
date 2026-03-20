import { useSuiClientQuery } from "@mysten/dapp-kit";
import { FC, useRef, useState, useEffect } from "react";
import { OuterBox } from "@/components/ui";
import { useNavigate } from "react-router-dom";
import { useProposalType } from "../hooks/useProposalType";
import { EcText } from "@/components/ui/Shared";
import { ButtonV3 } from "@/components/ui/button-v3";
import { ArrowRight } from "lucide-react";
import { NftImageModal } from "./NftImageModal";
import {
  parseMultiChoiceProposal,
  getChoicePercentages,
  getChoiceLabel,
  isUnixTimeExpired,
  formatTimeRemaining,
  getStatusBadge,
} from "../utils/proposalHelpers";
import { useTwitterDisplayNames } from "../hooks/useTwitterDisplayNames";

// Colors for choice bars (up to 20 choices)
const CHOICE_COLORS = [
  "bg-nasun-nw1",
  "bg-nasun-nw4",
  "bg-green-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-yellow-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-lime-500",
  "bg-sky-500",
  "bg-red-400",
  "bg-slate-400",
];

interface MultiChoiceProposalItemProps {
  id: string;
  filter?: "all" | "active" | "expired";
  hasVoted: boolean;
  voteNftUrl?: string;
  onVoteTxSuccess: () => void | Promise<void>;
}

export const MultiChoiceProposalItem: FC<MultiChoiceProposalItemProps> = ({
  id,
  filter = "all",
  hasVoted: hasVotedProp,
  voteNftUrl,
  onVoteTxSuccess,
}) => {
  const [localHasVoted, setLocalHasVoted] = useState(hasVotedProp);
  const navigate = useNavigate();
  const descRef = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  const {
    data: dataResponse,
    refetch: refetchProposal,
    error,
    isPending,
  } = useSuiClientQuery("getObject", {
    id,
    options: { showContent: true },
  });

  const { proposalType, isLoading: isTypeLoading } = useProposalType(id);

  useEffect(() => {
    const el = descRef.current;
    if (el) setIsClamped(el.scrollHeight > el.clientHeight);
  }, [dataResponse]);

  useEffect(() => {
    setLocalHasVoted(hasVotedProp);
  }, [hasVotedProp]);

  const proposal = (!isPending && !isTypeLoading && dataResponse?.data)
    ? parseMultiChoiceProposal(dataResponse.data, proposalType)
    : null;

  const { displayNames } = useTwitterDisplayNames(proposal?.choices || []);

  if (isPending || isTypeLoading) return <EcText centered text="Loading..." />;
  if (error) return <EcText isError text={`Error: ${error.message}`} />;
  if (!dataResponse.data || !proposal) return <EcText text="No data found" />;

  const isDelisted = proposal.status.variant === "Delisted";
  const isExpired = isUnixTimeExpired(proposal.expiration) || isDelisted;

  if (filter === "active" && isExpired) return null;
  if (filter === "expired" && !isExpired) return null;

  const percentages = getChoicePercentages(proposal.choicePowers);
  const totalPower = proposal.choicePowers.reduce((sum, p) => sum + p, 0);

  // Find leading choice
  const maxPower = Math.max(...proposal.choicePowers);
  const hasPassed = maxPower > 0;

  const activeCardClass = isExpired
    ? "!bg-nasun-white/5 !border-nasun-white/15 hover:!border-nasun-white/30"
    : "hover:border-nasun-nw1/70";

  const statusBadge = getStatusBadge(isDelisted, isExpired, hasPassed);

  return (
    <>
      <OuterBox
        color="nw0"
        padding="md"
        className={`flex flex-col relative h-full min-h-[320px] transition-all duration-200 ${activeCardClass} cursor-pointer`}
        style={{ order: isExpired ? 1 : 0 }}
        onClick={() => navigate(`/network/governance/proposal/${id}`)}
      >
        {/* Header: Badges + Title */}
        <div className="mb-3">
          <div className="flex justify-between items-center mb-2 -mt-2 -mx-2">
            <div className="flex items-center gap-2">
              {proposal.proposalType === "Poll" ? (
                <span className="px-2 py-0.5 text-xs uppercase font-bold rounded-full bg-nasun-nw1/20 text-nasun-nw1 border border-nasun-nw1/30">
                  Poll
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs uppercase font-bold rounded-full bg-nasun-nw4/20 text-nasun-nw4 border border-nasun-nw4/30">
                  Governance
                </span>
              )}
              <span
                className={`px-2 py-0.5 text-xs uppercase font-bold rounded-full border ${statusBadge.bg} ${statusBadge.text}`}
              >
                {statusBadge.label}
              </span>
            </div>
            {localHasVoted && (
              voteNftUrl ? (
                <div title="You have voted">
                  <NftImageModal
                    src={voteNftUrl}
                    thumbnailClassName="w-6 h-6 rounded-full border border-nasun-nw4/50"
                  />
                </div>
              ) : (
                <span className="text-xs px-2 py-0.5 font-medium rounded-sm bg-green-500/20 text-green-400 border border-green-500/40">
                  Voted
                </span>
              )
            )}
          </div>
          <h6 className={`${isExpired ? "text-nasun-white/50" : "text-white font-semibold"}`}>
            {proposal.title}
          </h6>
        </div>

        {/* Description */}
        <div className="flex-1 mb-4">
          <p
            ref={descRef}
            className={`${isExpired ? "text-nasun-white/50" : "text-nasun-white/80"} line-clamp-3`}
          >
            {proposal.description}
          </p>
          {isClamped && (
            <span className="text-nasun-nw1 text-sm mt-1 flex items-center justify-end gap-1 hover:underline">
              Read more <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </div>

        {/* Footer: Choice Bars + Time */}
        <div className="mt-auto pt-3 border-t border-nasun-white/5 space-y-1.5">
          {proposal.choices.map((choice, idx) => (
            <div key={idx}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className={`truncate mr-2 ${isExpired ? "text-nasun-white/30" : "text-nasun-white/70"}`}>
                  {getChoiceLabel(choice, displayNames)}
                </span>
                <span className={isExpired ? "text-nasun-white/30" : "text-nasun-white/50"}>
                  {percentages[idx]}%{totalPower > 0 ? ` (${proposal.choicePowers[idx]})` : ""}
                </span>
              </div>
              <div
                className={`w-full h-1.5 rounded-full overflow-hidden ${isExpired ? "bg-nasun-white/5" : "bg-nasun-white/10"}`}
              >
                <div
                  className={`h-full transition-all ${isExpired ? `${CHOICE_COLORS[idx % CHOICE_COLORS.length]}/40` : CHOICE_COLORS[idx % CHOICE_COLORS.length]}`}
                  style={{ width: `${percentages[idx]}%` }}
                />
              </div>
            </div>
          ))}

          {/* Equal weight indicator */}
          {proposal.useEqualWeight && (
            <p className="text-xs text-nasun-white/30 mt-1">Equal Weight: 1 vote per wallet</p>
          )}

          {/* Countdown */}
          <div className="flex items-center justify-between pt-1">
            <p className={`text-sm ${isExpired ? "text-nasun-white/30" : "text-nasun-white/50"}`}>
              {isDelisted ? "Delisted" : formatTimeRemaining(proposal.expiration)}
            </p>
          </div>
        </div>

        {/* Vote Button */}
        {!isExpired && (
          <ButtonV3
            variant="gradientDark"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/network/governance/proposal/${id}`);
            }}
            className="mt-3 w-full uppercase"
            disabled={localHasVoted}
          >
            {localHasVoted ? "Voted" : "Vote"}
          </ButtonV3>
        )}
      </OuterBox>
    </>
  );
};
