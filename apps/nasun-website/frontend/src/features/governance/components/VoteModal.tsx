import { FC, useRef, useState, useEffect } from "react";
import { Proposal } from "../types/voting";
import { useWallet, useZkLogin, getSuiClient } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui";
import { useTranslation } from "react-i18next";
import { useVotingPower } from "../hooks/useVotingPower";

interface VoteModalProps {
  proposal: Proposal;
  hasVoted: boolean;
  isOpen: boolean;
  onClose: () => void;
  onVote: (votedYes: boolean) => void;
}

export const VoteModal: FC<VoteModalProps> = ({ proposal, hasVoted, isOpen, onClose, onVote }) => {
  const { t } = useTranslation("proposals");
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkConnected, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;
  const packageId = useNetworkVariable("packageId");
  const toastId = useRef<number | string>();

  const [isPending, setIsPending] = useState(false);
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

  // Parse vote transaction errors into user-friendly messages
  function parseVoteError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);

    // Gas/balance issues
    if (message.includes("No valid gas coins")) {
      return "Not enough NASUN for transaction fee. Please get some tokens from the faucet first.";
    }
    if (message.includes("InsufficientGas") || message.includes("insufficient gas")) {
      return "Insufficient gas. The transaction requires more NASUN.";
    }

    // Move Abort codes
    if (message.includes("MoveAbort")) {
      if (message.includes(", 0)")) return "You have already voted on this proposal.";
      if (message.includes(", 2)")) return "This proposal has expired.";
      if (message.includes(", 3)")) return "Invalid voting power.";
    }

    // Network errors
    if (message.includes("network") || message.includes("fetch") || message.includes("timeout")) {
      return "Network error. Please check your connection and try again.";
    }

    // User cancelled
    if (message.includes("rejected") || message.includes("cancelled") || message.includes("canceled")) {
      return "Transaction was cancelled.";
    }

    // Fallback - show truncated message
    return `Vote failed: ${message.slice(0, 100)}`;
  }

  // Calculate total voting power
  const baseVotingPower = votingPower?.totalVotingPower || 1;
  const nftBonus = nftVerification?.nftBonus || 0;
  const totalVotingPower = baseVotingPower + nftBonus;

  // Reset NFT verification when modal closes
  useEffect(() => {
    if (!isOpen) {
      clearNftVerification();
      setShowNftOption(false);
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
    // Check if any wallet is connected
    const walletAddress = account?.address || zkState?.address;
    if (!isConnected || !walletAddress) {
      dismissToast(t("vote.error"));
      return;
    }

    const tx = new Transaction();
    // Pass voting power as the third argument (before clock)
    tx.moveCall({
      arguments: [
        tx.object(proposal.id.id),
        tx.pure.bool(voteYes),
        tx.pure.u64(totalVotingPower),
        tx.object("0x6"),
      ],
      target: `${packageId}::proposal::vote`,
    });

    showToast(t("vote.processing"));
    setIsPending(true);

    try {
      const suiClient = getSuiClient();
      let result;

      // Sign and execute based on wallet type
      if (isZkConnected && zkState) {
        // zkLogin signing
        tx.setSender(zkState.address);
        const bytes = await tx.build({ client: suiClient });
        const signature = await zkSignTransaction(bytes);
        result = await suiClient.executeTransactionBlock({
          transactionBlock: bytes,
          signature,
          options: { showEffects: true },
        });
      } else {
        // Local wallet signing
        const keypair = getKeypair();
        if (!keypair) {
          dismissToast(t("vote.error"));
          return;
        }
        result = await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: { showEffects: true },
        });
      }

      await suiClient.waitForTransaction({
        digest: result.digest,
        options: {
          showEffects: true,
        },
      });

      const eventResult = await suiClient.queryEvents({
        query: { Transaction: result.digest },
      });

      if (eventResult.data.length > 0) {
        const firstEvent = eventResult.data[0].parsedJson as {
          proposal_id?: string;
          voter?: string;
          vote_yes?: boolean;
        };
        const id = firstEvent.proposal_id || "No event found for given criteria";
        const voter = firstEvent.voter || "No event found for given criteria";
        const votedYes = firstEvent.vote_yes || "No event found for given criteria";
        console.log("Event Captured");
        console.log(id, voter, votedYes);
      } else {
        console.log("No events found");
      }

      setIsSuccess(true);
      dismissToast(t("vote.success"));
      onVote(voteYes);
    } catch (error: unknown) {
      console.error("Vote transaction failed:", error);
      const friendlyMessage = parseVoteError(error);
      dismissToast(friendlyMessage);
    } finally {
      setIsPending(false);
      setConfirmStep({ show: false, voteYes: null });
    }
  };

  const votingDisable = hasVoted || isPending || isSuccess;

  return (
    <div className="fixed inset-0 bg-nasun-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-nasun-c6 border border-nasun-c5/50 p-6 md:p-8 rounded-xl max-w-md w-full shadow-lg">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-2xl font-medium text-nasun-white">{proposal.title}</h2>
          {hasVoted || isSuccess ? (
            <div className="flex-shrink-0 text-sm px-3 py-1 font-medium rounded-full bg-green-500/20 text-green-400 border border-green-500/50">
              {t("vote.already_voted")}
            </div>
          ) : (
            <div className="flex-shrink-0 text-sm px-3 py-1 font-medium rounded-full bg-red-500/20 text-red-400 border border-red-500/50">
              {t("vote.not_voted_yet")}
            </div>
          )}
        </div>

        {!confirmStep.show && (
          <p className="mb-6 text-nasun-white/85">{proposal.description}</p>
        )}
        <div className="flex flex-col gap-4">
          {/* Current Vote Counts */}
          <div className="flex justify-between text-sm text-nasun-white/70">
            <span>👍 {t("proposal.yes_votes")}: {proposal.yesVotes}</span>
            <span>👎 {t("proposal.no_votes")}: {proposal.noVotes}</span>
          </div>

          {/* Voting Power Display */}
          {isConnected && !hasVoted && !isSuccess && !confirmStep.show && (
            <div className="bg-nasun-black/30 rounded-lg p-4 border border-nasun-c5/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-nasun-white/70">Your Voting Power</span>
                <span className="text-lg font-semibold text-nasun-c3">
                  {totalVotingPower}
                </span>
              </div>

              {/* Voting Power Breakdown */}
              <div className="text-xs text-nasun-white/50 space-y-1">
                <div className="flex justify-between">
                  <span>Base Power</span>
                  <span>{baseVotingPower}</span>
                </div>
                {nftBonus > 0 && (
                  <div className="flex justify-between text-nasun-c3">
                    <span>NFT Bonus</span>
                    <span>+{nftBonus}</span>
                  </div>
                )}
              </div>

              {/* NFT Verification Option */}
              {hasMetaMask && !nftVerification && (
                <div className="mt-3 pt-3 border-t border-nasun-c5/20">
                  <button
                    onClick={handleNftVerification}
                    disabled={isLoadingPower}
                    className="w-full text-sm text-nasun-c4 hover:text-nasun-c3 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                <div className="mt-3 pt-3 border-t border-nasun-c5/20">
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
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Confirm Your Vote
              </h4>
              <ul className="text-sm text-nasun-white/80 space-y-2 mb-4">
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">•</span>
                  <span>This vote <strong>cannot be undone</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">•</span>
                  <span>Signing confirms your vote — <strong>no tokens will be transferred</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">•</span>
                  <span>
                    Vote direction:{" "}
                    <strong className={confirmStep.voteYes ? "text-green-400" : "text-red-400"}>
                      {confirmStep.voteYes ? "YES" : "NO"}
                    </strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">•</span>
                  <span>
                    Voting power: <strong className="text-nasun-c3">{totalVotingPower}</strong>
                  </span>
                </li>
              </ul>
              <div className="flex gap-3">
                <Button
                  variant="c5"
                  size="md"
                  onClick={() => setConfirmStep({ show: false, voteYes: null })}
                  className="flex-1"
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant={confirmStep.voteYes ? "green" : "destructive"}
                  size="md"
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
            <div className="flex justify-between gap-4">
              {isConnected ? (
                <>
                  <Button
                    variant="green"
                    size="lg"
                    disabled={votingDisable}
                    onClick={() => setConfirmStep({ show: true, voteYes: true })}
                    className="flex-1"
                  >
                    {t("vote.vote_yes")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="lg"
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
          <Button variant="c5" size="lg" onClick={onClose} className="w-full">
            {t("vote.close")}
          </Button>
        </div>
      </div>
    </div>
  );
};
