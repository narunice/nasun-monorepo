import { FC, useRef } from "react";
import { Proposal } from "../../../../types/voting";
import {
  ConnectButton,
  useCurrentWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useNetworkVariable } from "../../../../config/suiNetworkConfig";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "react-toastify";
import { Button } from "../../../ui";

interface VoteModalProps {
  proposal: Proposal;
  hasVoted: boolean;
  isOpen: boolean;
  onClose: () => void;
  onVote: (votedYes: boolean) => void;
}

export const VoteModal: FC<VoteModalProps> = ({ proposal, hasVoted, isOpen, onClose, onVote }) => {
  const { connectionStatus } = useCurrentWallet();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending, isSuccess, reset } = useSignAndExecuteTransaction();
  const packageId = useNetworkVariable("packageId");
  const toastId = useRef<number | string>();

  if (!isOpen) return null;

  const showToast = (message: string) => (toastId.current = toast(message, { autoClose: false }));

  const dismissToast = (message: string) => {
    toast.dismiss(toastId.current);
    toast(message, { autoClose: 2400 });
  };

  const vote = (voteYes: boolean) => {
    const tx = new Transaction();
    tx.moveCall({
      arguments: [tx.object(proposal.id.id), tx.pure.bool(voteYes), tx.object("0x6")],
      target: `${packageId}::proposal::vote`,
    });

    showToast("Processing Transaction");
    signAndExecute(
      {
        transaction: tx as unknown as Parameters<typeof signAndExecute>[0]["transaction"],
      },
      {
        onError: () => {
          dismissToast("Transaction failed");
        },
        onSuccess: async ({ digest }) => {
          await suiClient.waitForTransaction({
            digest,
            options: {
              showEffects: true,
            },
          });

          const eventResult = await suiClient.queryEvents({
            query: { Transaction: digest },
          });

          if (eventResult.data.length > 0) {
            const firstEvent = eventResult.data[0].parsedJson as {
              proposal_id?: string;
              voter?: string;
              vote_yes?: boolean;
            };
            const id = firstEvent.proposal_id || "No event found for given criteria";
            const voter = firstEvent.voter || "No event found for given criteria";
            const voteYes = firstEvent.vote_yes || "No event found for given criteria";
            console.log("Event Captured");
            console.log(id, voter, voteYes);
          } else {
            console.log("No events found");
          }

          reset();
          dismissToast("Transaction completed successfully");
          onVote(voteYes);
        },
      }
    );
  };

  const votingDisable = hasVoted || isPending || isSuccess;

  return (
    <div className="fixed inset-0 bg-nasun-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-nasun-c6 border border-nasun-c5/50 p-6 md:p-8 rounded-xl max-w-md w-full shadow-lg">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-2xl font-medium text-nasun-white">{proposal.title}</h2>
          {hasVoted || isSuccess ? (
            <div className="flex-shrink-0 text-sm px-3 py-1 font-medium rounded-full bg-green-500/20 text-green-400 border border-green-500/50">
              Already voted
            </div>
          ) : (
            <div className="flex-shrink-0 text-sm px-3 py-1 font-medium rounded-full bg-red-500/20 text-red-400 border border-red-500/50">
              Not voted yet
            </div>
          )}
        </div>

        <p className="mb-6 text-nasun-white/85">{proposal.description}</p>
        <div className="flex flex-col gap-4">
          <div className="flex justify-between text-sm text-nasun-white/70">
            <span>👍 Yes votes: {proposal.yesVotes}</span>
            <span>👎 No votes: {proposal.noVotes}</span>
          </div>
          <div className="flex justify-between gap-4">
            {connectionStatus === "connected" ? (
              <>
                <Button
                  variant="green"
                  size="lg"
                  disabled={votingDisable}
                  onClick={() => vote(true)}
                  className="flex-1"
                >
                  Vote Yes
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  disabled={votingDisable}
                  onClick={() => vote(false)}
                  className="flex-1"
                >
                  Vote No
                </Button>
              </>
            ) : (
              <div className="w-full">
                <ConnectButton connectText="Connect your wallet to vote" />
              </div>
            )}
          </div>
          <Button variant="c5" size="lg" onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
