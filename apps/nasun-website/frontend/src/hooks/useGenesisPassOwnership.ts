/**
 * useGenesisPassOwnership Hook
 *
 * Direct on-chain ownership check via ERC-1155 balanceOfBatch.
 * Bypasses Alchemy indexing entirely — reads the contract state directly.
 * Works without MetaMask connected (uses wagmi public client).
 */

import { useReadContract } from "wagmi";
import {
  GENESIS_PASS_ABI,
  GENESIS_PASS_CHAIN_ID,
  GENESIS_PASS_CONTRACT,
} from "@/constants/genesis-pass-contract";
import { NFT_EDITIONS } from "@/constants/nft-drop";

const TOKEN_IDS = NFT_EDITIONS.map((e) => BigInt(e.id));

export function useGenesisPassOwnership(walletAddress: string | undefined) {
  const accounts = walletAddress
    ? Array(TOKEN_IDS.length).fill(walletAddress as `0x${string}`)
    : [];

  const { data, isLoading } = useReadContract({
    address: GENESIS_PASS_CONTRACT,
    abi: GENESIS_PASS_ABI,
    functionName: "balanceOfBatch",
    args: [accounts, TOKEN_IDS],
    chainId: GENESIS_PASS_CHAIN_ID,
    query: {
      enabled: !!walletAddress,
      staleTime: 60_000,
      refetchOnWindowFocus: true,
    },
  });

  const balances = data as bigint[] | undefined;
  const hasMinted = balances ? balances.some((b) => b > 0n) : false;

  // Find which edition the user owns (first match)
  const ownedEditionId = balances
    ? TOKEN_IDS.find((_, i) => balances[i] > 0n)
    : undefined;

  // All owned edition IDs (for multi-NFT enrichment)
  const ownedEditionIds = balances
    ? TOKEN_IDS.filter((_, i) => balances[i] > 0n).map(Number)
    : [];

  return {
    hasMinted,
    isLoading,
    ownedEditionId: ownedEditionId != null ? Number(ownedEditionId) : undefined,
    ownedEditionIds,
  };
}
