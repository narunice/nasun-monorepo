/**
 * useDirectVote Hook
 *
 * Direct voting for Governance proposals (user pays gas).
 * Similar to useSponsoredVote but without sponsor signature.
 *
 * Flow:
 * 1. Request Certificate from API (Oracle signs voting power)
 * 2. Build Transaction (mint_certificate + vote)
 * 3. User signs and pays gas
 * 4. Execute transaction
 */

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useAuth } from "@/features/auth";
import { VoteCertificate, VoteResult } from "../types/voting";
import { hexToBytes } from "../utils/proposalHelpers";

const API_URL = import.meta.env.VITE_GOVERNANCE_API_URL;
const PACKAGE_ID = import.meta.env.VITE_GOVERNANCE_PACKAGE_ID;
const ORACLE_ID = import.meta.env.VITE_VOTING_POWER_ORACLE_ID;
const REGISTRY_ID = import.meta.env.VITE_CERTIFICATE_REGISTRY_ID;
const SUI_RPC_URL = import.meta.env.VITE_SUI_RPC_URL || "https://rpc.devnet.nasun.io";
const CLOCK_ID = "0x6";

export function useDirectVote() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { account, status, getKeypair } = useWallet();
  const { isConnected: isZkConnected, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const { user } = useAuth();

  const vote = async (
    proposalId: string,
    voteYes: boolean
  ): Promise<VoteResult> => {
    setIsPending(true);
    setError(null);

    try {
      const voterAddress = isZkConnected ? zkState?.address : account?.address;
      if (!voterAddress) {
        throw new Error("Wallet not connected");
      }

      // 1. Request Certificate from API (still needed for voting power)
      const certResponse = await fetch(`${API_URL}/certificate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter: voterAddress,
          proposalId,
          twitterHandle: user?.twitterHandle,
          walletAddress: voterAddress,
        }),
      });

      if (!certResponse.ok) {
        const err = await certResponse.json();
        if (certResponse.status === 409) {
          throw new Error("You have already voted on this proposal");
        }
        throw new Error(err.error || "Failed to get certificate");
      }

      const cert: VoteCertificate = await certResponse.json();

      // 2. Build Transaction (mint_certificate + vote)
      const tx = new Transaction();
      const signatureBytes = hexToBytes(cert.signature);

      const [certificate] = tx.moveCall({
        target: `${PACKAGE_ID}::voting_power::mint_certificate`,
        arguments: [
          tx.object(ORACLE_ID),
          tx.object(REGISTRY_ID),
          tx.pure.address(voterAddress),
          tx.pure.id(proposalId),
          tx.pure.u64(cert.votingPower),
          tx.pure.u64(cert.expiresAt),
          tx.pure.vector("u8", signatureBytes),
          tx.object(CLOCK_ID),
        ],
      });

      tx.moveCall({
        target: `${PACKAGE_ID}::proposal::vote_with_certificate`,
        arguments: [
          tx.object(proposalId),
          tx.pure.bool(voteYes),
          certificate,
          tx.object(CLOCK_ID),
        ],
      });

      tx.setSender(voterAddress);

      // 3. User signs and pays gas directly
      const suiClient = new SuiClient({ url: SUI_RPC_URL });

      let result;
      if (isZkConnected && zkSignTransaction) {
        const txBytes = await tx.build({ client: suiClient });
        const sig = await zkSignTransaction(txBytes);
        const signature = typeof sig === "string" ? sig : sig.signature;
        result = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature: [signature],
          options: { showEffects: true },
        });
      } else if (status === "unlocked" && account) {
        const keypair = getKeypair();
        if (!keypair) {
          throw new Error("Wallet unlocked but keypair not available");
        }
        result = await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: { showEffects: true },
        });
      } else {
        throw new Error("No signing method available");
      }

      return {
        success: true,
        digest: result.digest,
        votingPower: cert.votingPower,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Vote failed";
      console.error("Direct vote error:", err);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsPending(false);
    }
  };

  return {
    vote,
    isPending,
    error,
    clearError: () => setError(null),
  };
}

export default useDirectVote;
