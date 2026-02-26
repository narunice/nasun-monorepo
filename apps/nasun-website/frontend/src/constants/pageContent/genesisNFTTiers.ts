// src/constants/pageContent/genesisNFTTiers.ts
import { NFTTiers, TierData } from "../../types/genesisNFTs.d";
import tier1Image from "../../assets/nft_images/tier1.webp";
import tier2Image from "../../assets/nft_images/tier2.webp";
import tier3Image from "../../assets/nft_images/tier3.webp";
import tier4Image from "../../assets/nft_images/tier4.webp";
import tier5Image from "../../assets/nft_images/tier5.webp";

// 3. 상수 정의
export const NFT_COLLECTION: Record<NFTTiers, TierData> = {
  [NFTTiers.TIER1]: {
    MAX_SUPPLY: 10,
    USD_PRICE: 0.5,
    IMAGE: tier1Image,
    TOKEN_ALLOCATION: "0.2%",
    CONFIG: {
      errorMessages: {
        supplyExceeded: "All Tier 1 NFTs have been minted",
        insufficientFunds: "Insufficient funds for Tier 1 NFT",
      },
    },
  },
  [NFTTiers.TIER2]: {
    MAX_SUPPLY: 20,
    USD_PRICE: 1,
    IMAGE: tier2Image,
    TOKEN_ALLOCATION: "0.1%",
    CONFIG: {
      errorMessages: {
        supplyExceeded: "All Tier 2 NFTs have been minted",
        insufficientFunds: "Insufficient funds for Tier 2 NFT",
      },
    },
  },
  [NFTTiers.TIER3]: {
    MAX_SUPPLY: 30,
    USD_PRICE: 1,
    IMAGE: tier3Image,
    TOKEN_ALLOCATION: "0.05%",
    CONFIG: {
      errorMessages: {
        supplyExceeded: "All Tier 3 NFTs have been minted",
        insufficientFunds: "Insufficient funds for Tier 3 NFT",
      },
    },
  },
  [NFTTiers.TIER4]: {
    MAX_SUPPLY: 40,
    USD_PRICE: 1,
    IMAGE: tier4Image,
    TOKEN_ALLOCATION: "0.025%",
    CONFIG: {
      errorMessages: {
        supplyExceeded: "All Tier 4 NFTs have been minted",
        insufficientFunds: "Insufficient funds for Tier 4 NFT",
      },
    },
  },
  [NFTTiers.TIER5]: {
    MAX_SUPPLY: 1000,
    USD_PRICE: 1,
    IMAGE: tier5Image,
    TOKEN_ALLOCATION: "0.001%",
    CONFIG: {
      errorMessages: {
        supplyExceeded: "All Tier 5 NFTs have been minted",
        insufficientFunds: "Insufficient funds for Tier 5 NFT",
      },
    },
  },
} as const; // 불변 객체로 선언

export { NFTTiers };
