/**
 * useGenesisPassOwnership Hook
 *
 * Direct on-chain ownership check via ERC-1155 balanceOfBatch.
 * Bypasses Alchemy indexing entirely — reads the contract state directly.
 * Works without MetaMask connected (uses wagmi public client).
 */

import { useReadContract } from "wagmi";
import { GENESIS_PASS_ABI, GENESIS_PASS_ADDRESSES } from "@/constants/genesis-pass-contract";
import { NFT_EDITIONS } from "@/constants/nft-drop";

const EXPECTED_CHAIN_ID = Number(import.meta.env.VITE_ETHEREUM_CHAIN_ID);

const contractAddress = GENESIS_PASS_ADDRESSES[EXPECTED_CHAIN_ID] as
  | `0x${string}`
  | undefined;

const TOKEN_IDS = NFT_EDITIONS.map((e) => BigInt(e.id));

export function useGenesisPassOwnership(walletAddress: string | undefined) {
  const accounts = walletAddress
    ? Array(TOKEN_IDS.length).fill(walletAddress as `0x${string}`)
    : [];

  const { data, isLoading } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "balanceOfBatch",
    args: [accounts, TOKEN_IDS],
    chainId: EXPECTED_CHAIN_ID,
    query: {
      enabled: !!walletAddress && !!contractAddress,
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

  return {
    hasMinted,
    isLoading,
    ownedEditionId: ownedEditionId != null ? Number(ownedEditionId) : undefined,
  };
}
