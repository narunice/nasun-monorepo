// nasun-website/frontend/src/hooks/PayAndMintNFT/usePayAndMintNFT.ts
// Simplified to SUI-only after multi-chain removal
import { usePayAndMintSuiNFT } from "./usePayAndMintSuiNFT";
import type { NFTTiers } from "../../types/genesisNFTs.d";

export interface MintingResult {
  txId: string;
  nftId: string;
  imageUrl?: string;
}

export interface PayAndMintNFT {
  payAndMintNFT: (tier: NFTTiers, usdPrice: number) => Promise<MintingResult>;
  isPending: boolean;
  error: Error | null;
}

export const usePayAndMintNFT = (): PayAndMintNFT => {
  return usePayAndMintSuiNFT();
};
