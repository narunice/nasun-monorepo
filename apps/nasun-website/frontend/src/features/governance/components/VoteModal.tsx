import { FC, useRef, useState, useEffect } from "react";
import { Proposal } from "../types/voting";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { toast } from "react-toastify";
import { Button } from "@/components/ui";
import { useTranslation } from "react-i18next";
import { useVotingPower } from "../hooks/useVotingPower";
import { useSponsoredVote } from "../hooks/useSponsoredVote";
import { useDirectVote } from "../hooks/useDirectVote";

interface VoteModalProps {
  proposal: Proposal;
  hasVoted: boolean;
  isOpen: boolean;
  onClose: () => void;
  onVote: (votedYes: boolean) => void | Promise<void>;
}

export const VoteModal: FC<VoteModalProps> = ({ proposal, hasVoted, isOpen, onClose, onVote }) => {
  const { t } = useTranslation("proposals");
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;
  const toastId = useRef<number | string>();

  // Sponsored vote hook (gas-free voting for Poll proposals)
  const { vote: sponsoredVote, isPending: isSponsoredPending } = useSponsoredVote();

  // Direct vote hook (user pays gas for Governance proposals)
  const { vote: directVote, isPending: isDirectPending } = useDirectVote();

  // Check if this is a Poll (sponsored) or Governance (user pays gas)
  const isSponsored = proposal.proposalType === "Poll";
  const isPending = isSponsored ? isSponsoredPending : isDirectPending;

  const [isSuccess, setIsSuccess] = useState(false);
  const [confirmStep, setConfirmStep] = useState<{
    show: boolean;
    voteYes: boolean | null;
  }>({ show: false, voteYes: null });

  // Voting Power state
  const {
    votingPower,
    nftVerification,
    isLoading: isLoadingPower,
    verifyNftOwnership,
    clearNftVerification,
  } = useVotingPower();
  const [showNftOption, setShowNftOption] = useState(false);

  // Check if MetaMask is available
  const hasMetaMask = typeof window !== "undefined" && !!window.ethereum?.isMetaMask;

  // Calculate total voting power
  const baseVotingPower = votingPower?.totalVotingPower || 1;
  const nftBonus = nftVerification?.nftBonus || 0;
  const totalVotingPower = baseVotingPower + nftBonus;

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      clearNftVerification();
      setShowNftOption(false);
      setConfirmStep({ show: false, voteYes: null });
    }
  }, [isOpen, clearNftVerification]);

  if (!isOpen) return null;

  const showToast = (message: string) => (toastId.current = toast(message, { autoClose: false }));

  const dismissToast = (message: string) => {
    toast.dismiss(toastId.current);
    toast(message, { autoClose: 2400 });
  };

  // Handle NFT verification
  const handleNftVerification = async () => {
    const result = await verifyNftOwnership(proposal.id.id);
    if (result?.hasNasunNft) {
      toast.success("NFT verified! +100 Voting Power");
    } else if (result) {
      toast.info("No Nasun NFT found in your wallet");
    }
  };

  const vote = async (voteYes: boolean) => {
    if (!isConnected) {
      dismissToast(t("vote.error"));
      return;
    }

    showToast(t("vote.processing"));

    // Prepare ETH signature for NFT bonus if verified
    const ethSignature = nftVerification?.ethAddress
      ? {
          message: `Nasun Governance: Verify NFT ownership for Proposal #${proposal.id.id}\nTimestamp: ${Date.now()}`,
          signature: "", // Would need to be captured during verification
        }
      : undefined;

    // Use appropriate voting method based on proposal type
    const result = isSponsored
      ? await sponsoredVote(proposal.id.id, voteYes, ethSignature)
      : await directVote(proposal.id.id, voteYes, ethSignature);

    if (result.success) {
      setIsSuccess(true);
      dismissToast(t("vote.success"));
      console.log("Vote successful:", result.digest, "Power:", result.votingPower);
      await onVote(voteYes);
    } else {
      dismissToast(result.error || t("vote.error"));
    }

    setConfirmStep({ show: false, voteYes: null });
  };

  const votingDisable = hasVoted || isPending || isSuccess;

  return (
    <div
      className="fixed inset-0 bg-nasun-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-nasun-c6/90 border border-nasun-c5/30 p-6 md:p-8 rounded-sm max-w-md w-full shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h4 className="text-nasun-white">{proposal.title}</h4>
          {hasVoted || isSuccess ? (
            <span className="flex-shrink-0 text-xs px-2 py-0.5 font-medium rounded-sm bg-green-500/20 text-green-400 border border-green-500/40">
              {t("vote.already_voted")}
            </span>
          ) : (
            <span className="flex-shrink-0 text-xs px-2 py-0.5 font-medium rounded-sm bg-nasun-c4/20 text-nasun-c4 border border-nasun-c4/30">
              {t("vote.not_voted_yet")}
            </span>
          )}
        </div>

        {/* Description */}
        {!confirmStep.show && (
          <p className="mb-5 text-nasun-white/85">{proposal.description}</p>
        )}

        <div className="flex flex-col gap-3">
          {/* Current Vote Counts */}
          <div className="flex justify-between text-sm text-nasun-white/60">
            <span>👍 {t("proposal.yes_votes")}: {proposal.yesVotes}</span>
            <span>👎 {t("proposal.no_votes")}: {proposal.noVotes}</span>
          </div>

          {/* Voting Power Display */}
          {isConnected && !hasVoted && !isSuccess && !confirmStep.show && (
            <div className="bg-gray-800/80 rounded-sm p-4 border border-nasun-c5/20">
              {/* Gas Fee Badge */}
              <div className="flex items-center justify-center gap-2 mb-3 pb-3 border-b border-nasun-c5/10">
                {isSponsored ? (
                  <>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-sm bg-green-500/20 text-green-400 border border-green-500/40">
                      Zero Gas Fee
                    </span>
                    <span className="text-xs text-nasun-white/40">Sponsored by Nasun</span>
                  </>
                ) : (
                  <>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-sm bg-nasun-c1/20 text-nasun-c1 border border-nasun-c1/40">
                      Gas Required
                    </span>
                    <span className="text-xs text-nasun-white/40">You pay transaction fee</span>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-nasun-white/60">Your Voting Power</span>
                <span className="text-lg font-semibold text-nasun-c1">
                  {totalVotingPower}
                </span>
              </div>

              {/* Voting Power Breakdown */}
              <div className="text-xs text-nasun-white/40 space-y-1">
                <div className="flex justify-between">
                  <span>Base Power</span>
                  <span>{baseVotingPower}</span>
                </div>
                {nftBonus > 0 && (
                  <div className="flex justify-between text-nasun-c1">
                    <span>NFT Bonus</span>
                    <span>+{nftBonus}</span>
                  </div>
                )}
              </div>

              {/* NFT Verification Option */}
              {hasMetaMask && !nftVerification && (
                <div className="mt-3 pt-3 border-t border-nasun-c5/10">
                  <button
                    onClick={handleNftVerification}
                    disabled={isLoadingPower}
                    className="w-full text-sm text-nasun-c4 hover:text-nasun-c5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoadingPower ? (
                      "Verifying..."
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                        Add NFT Voting Power (MetaMask)
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* NFT Verified Badge */}
              {nftVerification?.hasNasunNft && (
                <div className="mt-3 pt-3 border-t border-nasun-c5/10">
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    NFT Verified
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Confirmation Step */}
          {confirmStep.show && (
            <div className="bg-nasun-c1/5 border border-nasun-c1/20 rounded-sm p-4">
              <h5 className="text-nasun-c1 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Confirm Your Vote
              </h5>
              <ul className="text-sm text-nasun-white/80 space-y-2 mb-4">
                <li className="flex items-start gap-2">
                  <span className="text-nasun-c1">•</span>
                  <span>This vote <strong className="text-nasun-white">cannot be undone</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-nasun-c1">•</span>
                  <span>
                    Vote direction:{" "}
                    <strong className={confirmStep.voteYes ? "text-green-400" : "text-red-400"}>
                      {confirmStep.voteYes ? "YES" : "NO"}
                    </strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-nasun-c1">•</span>
                  <span>
                    Voting power: <strong className="text-nasun-c1">{totalVotingPower}</strong>
                  </span>
                </li>
              </ul>
              <div className="flex gap-3">
                <Button
                  variant="outlineC5"
                  size="default"
                  onClick={() => setConfirmStep({ show: false, voteYes: null })}
                  className="flex-1"
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant={confirmStep.voteYes ? "green" : "destructive"}
                  size="default"
                  onClick={() => vote(confirmStep.voteYes!)}
                  className="flex-1"
                  disabled={isPending}
                >
                  {isPending ? "Voting..." : "Confirm Vote"}
                </Button>
              </div>
            </div>
          )}

          {/* Vote Buttons */}
          {!confirmStep.show && (
            <div className="flex justify-between gap-3">
              {isConnected ? (
                <>
                  <Button
                    variant="green"
                    size="default"
                    disabled={votingDisable}
                    onClick={() => setConfirmStep({ show: true, voteYes: true })}
                    className="flex-1"
                  >
                    {t("vote.vote_yes")}
                  </Button>
                  <Button
                    variant="scarlet"
                    size="default"
                    disabled={votingDisable}
                    onClick={() => setConfirmStep({ show: true, voteYes: false })}
                    className="flex-1"
                  >
                    {t("vote.vote_no")}
                  </Button>
                </>
              ) : (
                <div className="w-full flex justify-center">
                  <WalletConnect dropdownPosition="top" />
                </div>
              )}
            </div>
          )}

          <Button variant="outlineC5" size="default" onClick={onClose} className="w-full">
            {t("vote.close")}
          </Button>
        </div>
      </div>
    </div>
  );
};
