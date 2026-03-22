import { FC, useRef, useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MultiChoiceProposal } from "../types/multiChoice";
import {
  getChoiceLabel,
  extractTweetHandle,
} from "../utils/proposalHelpers";
import { useTwitterDisplayNames } from "../hooks/useTwitterDisplayNames";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { toast } from "react-toastify";
import { ButtonV3 } from "@/components/ui/button-v3";
import { useVotingPower } from "../hooks/useVotingPower";
import { useMultiChoiceSponsoredVote } from "../hooks/useMultiChoiceSponsoredVote";
import { useMultiChoiceDirectVote } from "../hooks/useMultiChoiceDirectVote";

interface MultiChoiceVoteModalProps {
  proposal: MultiChoiceProposal;
  hasVoted: boolean;
  isOpen: boolean;
  onClose: () => void;
  onVote: (selectedChoice: number) => void | Promise<void>;
  initialChoice?: number;
}

export const MultiChoiceVoteModal: FC<MultiChoiceVoteModalProps> = ({
  proposal,
  hasVoted,
  isOpen,
  onClose,
  onVote,
  initialChoice,
}) => {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;
  const toastId = useRef<number | string | null>(null);

  const { displayNames, profiles } = useTwitterDisplayNames(proposal.choices);
  const { vote: sponsoredVote, isPending: isSponsoredPending } =
    useMultiChoiceSponsoredVote();
  const { vote: directVote, isPending: isDirectPending } =
    useMultiChoiceDirectVote();

  const isSponsored = proposal.proposalType === "Poll";
  const isPending = isSponsored ? isSponsoredPending : isDirectPending;

  const [isSuccess, setIsSuccess] = useState(false);

  const { votingPower, isLoading: isLoadingPower } = useVotingPower();

  const totalVotingPower = votingPower?.totalVotingPower || 10;
  const effectivePower = proposal.useEqualWeight ? 1 : totalVotingPower;

  const selectedChoice = initialChoice ?? null;

  useEffect(() => {
    if (!isOpen) {
      setIsSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen || selectedChoice === null) return null;

  const showToast = (message: string) =>
    (toastId.current = toast(message, { autoClose: false }));

  const dismissToast = (message: string) => {
    if (toastId.current !== null) toast.dismiss(toastId.current);
    toast(message, { autoClose: 2400 });
  };

  const vote = async () => {
    if (!isConnected || selectedChoice === null) return;

    showToast("Processing your vote...");

    const result = isSponsored
      ? await sponsoredVote(proposal.id.id, selectedChoice)
      : await directVote(proposal.id.id, selectedChoice);

    if (result.success) {
      setIsSuccess(true);
      dismissToast("Vote submitted successfully!");
      await onVote(selectedChoice);
    } else {
      dismissToast(result.error || "Failed to submit vote");
    }
  };

  const votingDisable = hasVoted || isPending || isSuccess;

  const handle = extractTweetHandle(proposal.choices[selectedChoice]);
  const profile = handle ? profiles?.get(handle.toLowerCase()) : null;
  const choiceLabel = getChoiceLabel(
    proposal.choices[selectedChoice],
    displayNames,
  );

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose} modal={false}>
      <Dialog.Portal>
        <div
          className="fixed inset-0 bg-nasun-black/70 backdrop-blur-sm z-50"
          onClick={onClose}
        />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            className="bg-gray-900 border border-nasun-nw2/30 p-6 md:p-8 rounded-sm max-w-md w-full shadow-lg flex flex-col pointer-events-auto"
            aria-describedby={undefined}
          >
            {/* Header */}
            <Dialog.Title className="text-nasun-white font-semibold text-lg mb-5">
              {isConnected ? "Confirm Your Vote" : "Log In / Sign Up to Vote"}
            </Dialog.Title>

            <div className="flex flex-col gap-4">
              {isConnected ? (
                <>
                  {/* Selected Candidate */}
                  <div className="flex items-center gap-3 p-4 rounded-sm border border-nasun-nw1/40 bg-nasun-nw1/10">
                    {profile?.profileImageUrl && (
                      <img
                        src={profile.profileImageUrl}
                        alt={profile.displayName}
                        className="w-12 h-12 rounded-full flex-shrink-0"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-nasun-white font-medium block truncate">
                        {choiceLabel}
                      </span>
                      {handle && choiceLabel !== `@${handle}` && (
                        <span className="text-xs text-nasun-white/40">
                          @{handle}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Vote Details */}
                  {!votingDisable && (
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between text-nasun-white/60">
                        <span>Voting Power</span>
                        <span className="font-semibold text-nasun-nw4">
                          {proposal.useEqualWeight
                            ? "1 (Equal Weight)"
                            : isLoadingPower
                              ? "..."
                              : effectivePower}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-nasun-white/60">
                        <span>Gas Fee</span>
                        {isSponsored ? (
                          <span className="text-green-400 text-xs font-medium">
                            Sponsored by Nasun
                          </span>
                        ) : (
                          <span className="text-nasun-nw4 text-xs font-medium">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-nasun-white/40 pt-1">
                        This vote cannot be undone.
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3">
                    <ButtonV3
                      variant="nw2"
                      outline
                      size="sm"
                      onClick={onClose}
                      className="flex-1 font-normal"
                      disabled={isPending}
                    >
                      Cancel
                    </ButtonV3>
                    <ButtonV3
                      variant="nw1"
                      size="sm"
                      onClick={vote}
                      className="flex-1 font-normal"
                      disabled={votingDisable}
                    >
                      {isPending
                        ? "Voting..."
                        : hasVoted || isSuccess
                          ? "Already Voted"
                          : "Confirm Vote"}
                    </ButtonV3>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-nasun-white/60 text-center py-2">
                    You need to log in or create an account to vote on this proposal.
                  </p>
                  <ButtonV3
                    variant="nw1"
                    size="sm"
                    onClick={() => {
                      onClose();
                      window.dispatchEvent(new CustomEvent("nasun:open-login"));
                    }}
                    className="w-full font-normal"
                  >
                    Log In / Sign Up
                  </ButtonV3>
                  <Dialog.Close asChild>
                    <ButtonV3
                      variant="nw2"
                      outline
                      size="sm"
                      className="w-full font-normal"
                    >
                      Close
                    </ButtonV3>
                  </Dialog.Close>
                </>
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
