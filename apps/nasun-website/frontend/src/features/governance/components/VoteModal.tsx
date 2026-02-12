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
import { useAuth } from "@/features/auth";

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
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;
  const toastId = useRef<number | string>();
  const { user } = useAuth();

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
  const { votingPower, isLoading: isLoadingPower, fetchVotingPower } = useVotingPower();

  // Fetch voting power when modal opens
  useEffect(() => {
    if (isOpen && isConnected) {
      const walletAddress = isZkConnected ? zkState?.address : account?.address;
      fetchVotingPower(user?.twitterHandle, walletAddress);
    }
  }, [isOpen, isConnected, isZkConnected, zkState?.address, account?.address, user?.twitterHandle, fetchVotingPower]);

  const totalVotingPower = votingPower?.totalVotingPower || 1;

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmStep({ show: false, voteYes: null });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (message: string) => (toastId.current = toast(message, { autoClose: false }));

  const dismissToast = (message: string) => {
    toast.dismiss(toastId.current);
    toast(message, { autoClose: 2400 });
  };

  const vote = async (voteYes: boolean) => {
    if (!isConnected) {
      dismissToast(t("vote.error"));
      return;
    }

    showToast(t("vote.processing"));

    const result = isSponsored
      ? await sponsoredVote(proposal.id.id, voteYes)
      : await directVote(proposal.id.id, voteYes);

    if (result.success) {
      setIsSuccess(true);
      dismissToast(t("vote.success"));
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
        className="bg-nasun-nw3/80 border border-nasun-nw2/30 p-6 md:p-8 rounded-sm max-w-md w-full shadow-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4 flex-shrink-0">
          <h6 className="text-nasun-white font-semibold">{proposal.title}</h6>
          {hasVoted || isSuccess ? (
            <span className="flex-shrink-0 text-xs px-2 py-0.5 font-medium rounded-sm bg-green-500/20 text-green-400 border border-green-500/40">
              {t("vote.already_voted")}
            </span>
          ) : (
            <span className="flex-shrink-0 text-xs px-2 py-0.5 font-medium rounded-sm bg-nasun-nw1/20 text-nasun-nw1 border border-nasun-nw1/30">
              {t("vote.not_voted_yet")}
            </span>
          )}
        </div>

        {/* Description - Scrollable */}
        {!confirmStep.show && (
          <div className="mb-5 overflow-y-auto max-h-[30vh] pr-2 flex-shrink custom-scrollbar">
            <p className="text-nasun-white/85">{proposal.description}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 flex-shrink-0">
          {/* Current Vote Counts */}
          <div className="flex justify-between text-sm text-nasun-white/60">
            <span>Yes: {proposal.yesVotes}</span>
            <span>No: {proposal.noVotes}</span>
          </div>

          {/* Voting Power Display */}
          {isConnected && !hasVoted && !isSuccess && !confirmStep.show && (
            <div className="bg-gray-800/80 rounded-sm p-4 border border-nasun-nw2/20">
              {/* Gas Fee Badge */}
              <div className="flex items-center justify-center gap-2 mb-3 pb-3 border-b border-nasun-nw2/10">
                {isSponsored ? (
                  <>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-sm bg-green-500/20 text-green-400 border border-green-500/40">
                      Zero Gas Fee
                    </span>
                    <span className="text-xs text-nasun-white/40">Sponsored by Nasun</span>
                  </>
                ) : (
                  <>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-sm bg-nasun-nw4/20 text-nasun-nw4 border border-nasun-nw4/40">
                      Gas Required
                    </span>
                    <span className="text-xs text-nasun-white/40">You pay transaction fee</span>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-nasun-white/60">Your Voting Power</span>
                <span className="text-lg font-semibold text-nasun-nw4">
                  {isLoadingPower ? "..." : totalVotingPower}
                </span>
              </div>

              {/* V2 Voting Power Breakdown */}
              {votingPower?.breakdown && (
                <div className="text-xs text-nasun-white/40 space-y-1">
                  <div className="flex justify-between">
                    <span>Base</span>
                    <span>{votingPower.breakdown.base}</span>
                  </div>
                  {votingPower.breakdown.leaderboard > 0 && (
                    <div className="flex justify-between">
                      <span>Leaderboard</span>
                      <span>+{votingPower.breakdown.leaderboard}</span>
                    </div>
                  )}
                  {votingPower.breakdown.onChain > 0 && (
                    <div className="flex justify-between">
                      <span>On-Chain Activity</span>
                      <span>+{votingPower.breakdown.onChain}</span>
                    </div>
                  )}
                  {votingPower.breakdown.battalionAllowlist > 0 && (
                    <div className="flex justify-between text-nasun-nw4">
                      <span>Battalion Allowlist</span>
                      <span>+{votingPower.breakdown.battalionAllowlist}</span>
                    </div>
                  )}
                  {votingPower.breakdown.genesisAllowlist > 0 && (
                    <div className="flex justify-between text-nasun-nw4">
                      <span>Genesis Whitelist</span>
                      <span>+{votingPower.breakdown.genesisAllowlist}</span>
                    </div>
                  )}
                  {votingPower.breakdown.xLinked > 0 && (
                    <div className="flex justify-between">
                      <span>X Account Linked</span>
                      <span>+{votingPower.breakdown.xLinked}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Confirmation Step */}
          {confirmStep.show && (
            <div className="bg-nasun-nw4/5 border border-nasun-nw4/20 rounded-sm p-4">
              <h5 className="text-nasun-nw4 mb-3 flex items-center gap-2">
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
                  <span className="text-nasun-nw4">•</span>
                  <span>This vote <strong className="text-nasun-white">cannot be undone</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-nasun-nw4">•</span>
                  <span>
                    Vote direction:{" "}
                    <strong className={confirmStep.voteYes ? "text-green-400" : "text-red-400"}>
                      {confirmStep.voteYes ? "YES" : "NO"}
                    </strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-nasun-nw4">•</span>
                  <span>
                    Voting power: <strong className="text-nasun-nw4">{totalVotingPower}</strong>
                  </span>
                </li>
              </ul>
              <div className="flex gap-3">
                <Button
                  variant="outlineNw2"
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

          <Button variant="outlineNw2" size="default" onClick={onClose} className="w-full">
            {t("vote.close")}
          </Button>
        </div>
      </div>
    </div>
  );
};
