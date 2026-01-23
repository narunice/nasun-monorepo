/**
 * useSponsoredVote Hook
 *
 * Handles gas-free voting with VotingPowerCertificate + Sponsored Transaction.
 *
 * Flow:
 * 1. Request Certificate from API (Oracle signs voting power)
 * 2. Build Transaction (mint_certificate + vote)
 * 3. Get sponsor signature from API
 * 4. User signs
 * 5. Execute with both signatures
 */

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { fromBase64, toBase64 } from "@mysten/bcs";
import { useAuth } from "@/features/auth";

const API_URL = import.meta.env.VITE_GOVERNANCE_API_URL;
const PACKAGE_ID = import.meta.env.VITE_GOVERNANCE_PACKAGE_ID;
const ORACLE_ID = import.meta.env.VITE_VOTING_POWER_ORACLE_ID;
const REGISTRY_ID = import.meta.env.VITE_CERTIFICATE_REGISTRY_ID;
const SUI_RPC_URL = import.meta.env.VITE_SUI_RPC_URL || "https://rpc.devnet.nasun.io";
const CLOCK_ID = "0x6";

interface Certificate {
  voter: string;
  proposalId: string;
  votingPower: number;
  expiresAt: number;
  signature: string;
  breakdown: {
    leaderboard: number;
    nft: number;
    token: number;
  };
}

interface VoteResult {
  success: boolean;
  digest?: string;
  votingPower?: number;
  error?: string;
}

export function useSponsoredVote() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { account, status, getKeypair } = useWallet();
  const { isConnected: isZkConnected, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const { user } = useAuth();

  /**
   * Execute a sponsored vote
   * @param proposalId - The proposal ID to vote on
   * @param voteYes - true for Yes, false for No
   * @param ethSignature - Optional ETH signature for NFT bonus verification
   */
  const vote = async (
    proposalId: string,
    voteYes: boolean,
    ethSignature?: { message: string; signature: string }
  ): Promise<VoteResult> => {
    setIsPending(true);
    setError(null);

    try {
      // Determine voter address
      const voterAddress = isZkConnected ? zkState?.address : account?.address;
      if (!voterAddress) {
        throw new Error("Wallet not connected");
      }

      // 1. Request Certificate from API
      const certResponse = await fetch(`${API_URL}/certificate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter: voterAddress,
          proposalId,
          twitterHandle: user?.twitterHandle,
          ethSignature,
        }),
      });

      if (!certResponse.ok) {
        const err = await certResponse.json();
        if (certResponse.status === 409) {
          throw new Error("You have already voted on this proposal");
        }
        throw new Error(err.error || "Failed to get certificate");
      }

      const cert: Certificate = await certResponse.json();
      console.log("Certificate received:", { votingPower: cert.votingPower, expiresAt: cert.expiresAt });

      // 2. Build Transaction (mint_certificate + vote)
      const tx = new Transaction();

      // Convert signature from hex to bytes (browser-compatible)
      const signatureBytes = Array.from(
        Uint8Array.from(cert.signature.match(/.{2}/g)!, b => parseInt(b, 16))
      );

      // mint_certificate
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

      // vote_with_certificate (upgraded from deprecated vote function)
      tx.moveCall({
        target: `${PACKAGE_ID}::proposal::vote_with_certificate`,
        arguments: [
          tx.object(proposalId),
          tx.pure.bool(voteYes),
          certificate,
          tx.object(CLOCK_ID),
        ],
      });

      // 3. Get sponsor signature
      const suiClient = new SuiClient({ url: SUI_RPC_URL });
      const kindBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

      const sponsorResponse = await fetch(`${API_URL}/sponsor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txKindBytes: toBase64(kindBytes),
          sender: voterAddress,
        }),
      });

      if (!sponsorResponse.ok) {
        const err = await sponsorResponse.json();
        throw new Error(err.error || "Failed to get sponsor signature");
      }

      const { txBytes, sponsorSignature } = await sponsorResponse.json();
      const txBytesArray = fromBase64(txBytes);

      // 4. User signs
      let userSignature: string;

      if (isZkConnected && zkSignTransaction) {
        // zkLogin signing
        const sig = await zkSignTransaction(txBytesArray);
        userSignature = typeof sig === "string" ? sig : sig.signature;
      } else if (status === "unlocked" && account) {
        // Local wallet signing
        const keypair = getKeypair();
        if (!keypair) {
          throw new Error("Wallet unlocked but keypair not available");
        }
        const sig = await keypair.signTransaction(txBytesArray);
        userSignature = sig.signature;
      } else {
        throw new Error("No signing method available");
      }

      // 5. Execute with both signatures (user + sponsor)
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [userSignature, sponsorSignature],
        options: { showEffects: true },
      });

      console.log("Vote transaction successful:", result.digest);

      return {
        success: true,
        digest: result.digest,
        votingPower: cert.votingPower,
      };
    } catch (err: any) {
      const errorMessage = err.message || "Vote failed";
      console.error("Sponsored vote error:", err);
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

export default useSponsoredVote;
