import { FC, useRef, useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MultiChoiceProposal } from "../types/multiChoice";
import {
  getChoiceLabel,
  extractTweetHandle,
  extractTweetId,
} from "../utils/proposalHelpers";
import { useTwitterDisplayNames } from "../hooks/useTwitterDisplayNames";
import { ExternalLink } from "lucide-react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
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
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);

  const { votingPower, isLoading: isLoadingPower } = useVotingPower();

  const totalVotingPower = votingPower?.totalVotingPower || 10;
  const effectivePower = proposal.useEqualWeight ? 1 : totalVotingPower;

  useEffect(() => {
    if (!isOpen) {
      setSelectedChoice(null);
      setConfirmStep(false);
    } else {
      setSelectedChoice(initialChoice ?? null);
    }
    // Only react to isOpen changes, not initialChoice changes while open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

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

    setConfirmStep(false);
  };

  const votingDisable = hasVoted || isPending || isSuccess;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose} modal={false}>
      <Dialog.Portal>
        <div
          className="fixed inset-0 bg-nasun-black/70 backdrop-blur-sm z-50"
          onClick={onClose}
        />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            className="bg-gray-900 border border-nasun-nw2/30 p-6 md:p-8 rounded-sm max-w-md w-full shadow-lg max-h-[calc(100vh-2rem)] overflow-y-auto flex flex-col pointer-events-auto"
            aria-describedby={undefined}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-4 flex-shrink-0">
              <Dialog.Title className="text-nasun-white font-semibold text-lg">
                {proposal.title}
              </Dialog.Title>
              {hasVoted || isSuccess ? (
                <span className="flex-shrink-0 text-xs px-2 py-0.5 font-medium rounded-sm bg-green-500/20 text-green-400 border border-green-500/40">
                  Voted
                </span>
              ) : (
                <span className="flex-shrink-0 text-xs px-2 py-0.5 font-medium rounded-sm bg-nasun-nw1/20 text-nasun-nw1 border border-nasun-nw1/30">
                  Not voted yet
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3 flex-shrink-0">
              {/* Voting Power / Equal Weight Display */}
              {isConnected && !hasVoted && !isSuccess && !confirmStep && (
                <div className="bg-gray-800/80 rounded-sm p-4 border border-nasun-nw2/20">
                  {/* Gas Fee Badge */}
                  <div className="flex items-center justify-end gap-2 mb-3 pb-3 border-b border-nasun-nw2/10">
                    {isSponsored ? (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-sm bg-green-500/20 text-green-400 border border-green-500/40">
                        Gas Fee Sponsored by Nasun
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-sm bg-nasun-nw4/20 text-nasun-nw4 border border-nasun-nw4/40">
                        Gas Required
                      </span>
                    )}
                  </div>

                  {proposal.useEqualWeight ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-nasun-white/60">
                        Equal Weight
                      </span>
                      <span className="text-lg font-semibold text-nasun-nw4">
                        1 vote
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-nasun-white/60">
                          Your Voting Power
                        </span>
                        <span className="text-lg font-semibold text-nasun-nw4">
                          {isLoadingPower ? "..." : totalVotingPower}
                        </span>
                      </div>
                      {votingPower?.breakdown && (
                        <div className="text-xs text-nasun-white/40 space-y-1">
                          <div className="flex justify-between">
                            <span>Base</span>
                            <span>{votingPower.breakdown.base}</span>
                          </div>
                          {(votingPower.breakdown.xLinked ?? 0) > 0 && (
                            <div className="flex justify-between">
                              <span>X Account</span>
                              <span>+{votingPower.breakdown.xLinked}</span>
                            </div>
                          )}
                          {(votingPower.breakdown.telegram ?? 0) > 0 && (
                            <div className="flex justify-between">
                              <span>Telegram</span>
                              <span>+{votingPower.breakdown.telegram}</span>
                            </div>
                          )}
                          {(votingPower.breakdown.rankBonus ?? 0) > 0 && (
                            <div className="flex justify-between">
                              <span>Rank Bonus</span>
                              <span>+{votingPower.breakdown.rankBonus}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Confirmation Step */}
              {confirmStep && selectedChoice !== null && (
                <div className="bg-nasun-nw4/5 border border-nasun-nw4/20 rounded-sm p-4">
                  <h2 className="text-nasun-nw4 mb-3 flex items-center gap-2 text-base">
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Confirm Your Vote
                  </h2>
                  <ul className="text-sm text-nasun-white/80 space-y-2 mb-4">
                    <li className="flex items-start gap-2">
                      <span className="text-nasun-nw4">-</span>
                      <span>
                        This vote{" "}
                        <strong className="text-nasun-white">
                          cannot be undone
                        </strong>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-nasun-nw4">-</span>
                      <span>
                        Your choice:{" "}
                        <strong className="text-nasun-nw1">
                          {getChoiceLabel(
                            proposal.choices[selectedChoice],
                            displayNames,
                          )}
                        </strong>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-nasun-nw4">-</span>
                      <span>
                        Voting power:{" "}
                        <strong className="text-nasun-nw4">
                          {effectivePower}
                        </strong>
                      </span>
                    </li>
                  </ul>
                  <div className="flex gap-3">
                    <ButtonV3
                      variant="nw2"
                      outline
                      size="sm"
                      onClick={() => setConfirmStep(false)}
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
                      disabled={isPending}
                    >
                      {isPending ? "Voting..." : "Confirm Vote"}
                    </ButtonV3>
                  </div>
                </div>
              )}

              {/* Choice Selection (Radio Buttons) */}
              {!confirmStep && (
                <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1 custom-scrollbar">
                  {proposal.choices.map((choice, idx) => {
                    const handle = extractTweetHandle(choice);
                    const tweetId = extractTweetId(choice);
                    const label = getChoiceLabel(choice, displayNames);
                    const profile = handle
                      ? profiles?.get(handle.toLowerCase())
                      : null;
                    const isTweet = !!tweetId;

                    return (
                      <label
                        key={idx}
                        className={`flex items-center gap-3 p-3 rounded-sm border cursor-pointer transition-all ${
                          selectedChoice === idx
                            ? "border-nasun-nw1/60 bg-nasun-nw1/10"
                            : "border-nasun-white/10 bg-gray-800/50 hover:border-nasun-white/20"
                        } ${votingDisable ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        <input
                          type="radio"
                          name="multi-choice-vote"
                          checked={selectedChoice === idx}
                          onChange={() => setSelectedChoice(idx)}
                          disabled={votingDisable}
                          className="accent-nasun-nw1 w-4 h-4 flex-shrink-0"
                        />
                        {profile?.profileImageUrl && (
                          <img
                            src={profile.profileImageUrl}
                            alt={profile.displayName}
                            className="w-10 h-10 rounded-full flex-shrink-0"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-nasun-white/90 block truncate">
                            {label}
                          </span>
                          {isTweet && handle && label !== `@${handle}` && (
                            <span className="text-xs text-nasun-white/40">
                              @{handle}
                            </span>
                          )}
                        </div>
                        {isTweet && (
                          <a
                            href={choice}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-nasun-white/30 hover:text-nasun-nw1 flex-shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Submit Button */}
              {!confirmStep && (
                <div className="flex justify-between gap-3">
                  {isConnected ? (
                    <ButtonV3
                      variant="nw1"
                      size="sm"
                      disabled={votingDisable || selectedChoice === null}
                      onClick={() => setConfirmStep(true)}
                      className="w-full font-normal"
                    >
                      {hasVoted || isSuccess ? "Already Voted" : "Submit Vote"}
                    </ButtonV3>
                  ) : (
                    <div className="w-full flex justify-center">
                      <WalletConnect dropdownPosition="top" />
                    </div>
                  )}
                </div>
              )}

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
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
