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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full">
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold mb-4">{proposal.title}</h2>
          {hasVoted || isSuccess ? (
            <div className="w-fit text-sm p-1 font-medium rounded-lg-full bg-green-200 text-gray-800 text-center">
              <p className="px-2">Already voted</p>
            </div>
          ) : (
            <div className="w-fit text-sm p-1 font-medium rounded-lg-full bg-red-200 text-gray-800 text-center">
              <p className="px-2">Not voted yet</p>
            </div>
          )}
        </div>

        <p className="mb-6 text-gray-300">{proposal.description}</p>
        <div className="flex flex-col gap-4">
          <div className="flex justify-between text-sm text-gray-400">
            <span>👍Yes votes: {proposal.yesVotes}</span>
            <span>👎No votes: {proposal.noVotes}</span>
          </div>
          <div className="flex justify-between gap-4">
            {connectionStatus === "connected" ? (
              <>
                <button
                  disabled={votingDisable}
                  onClick={() => vote(true)}
                  className="flex-1 bg-green-500 text-white px-6 
                  py-2 rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Vote Yes
                </button>
                <button
                  disabled={votingDisable}
                  onClick={() => vote(false)}
                  className="flex-1 bg-red-500 text-white px-6 
                  py-2 rounded-lg hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Vote No
                </button>
              </>
            ) : (
              <div>
                <ConnectButton connectText="Connect your wallet to vote" />
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-full bg-blue-300 px-4 py-2 rounded-lg hover:bg-blue-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
