// src/types/genesisNFTs.d.ts

/**
 * NFT 티어 등급 (Enum)
 */
export enum NFTTiers {
  TIER1 = "1",
  TIER2 = "2",
  TIER3 = "3",
  TIER4 = "4",
  TIER5 = "5",
}

export const NFTTierDisplayNames: Record<NFTTiers, string> = {
  [NFTTiers.TIER1]: "Tier 1",
  [NFTTiers.TIER2]: "Tier 2",
  [NFTTiers.TIER3]: "Tier 3",
  [NFTTiers.TIER4]: "Tier 4",
  [NFTTiers.TIER5]: "Tier 5",
};

/**
 * 개별 NFT 티어 데이터 구조
 */
export interface TierData {
  IMAGE: string;
  USD_PRICE: number;
  MAX_SUPPLY: number;
  TOKEN_ALLOCATION: string;
  CONFIG: {
    errorMessages: {
      supplyExceeded: string;
      insufficientFunds: string;
    };
  };
  BENEFITS?: string[];
}

/**
 * 전체 NFT 컬렉션 구조
 */
export interface NFTCollection {
  [key in NFTTiers]: TierData;
}

/**
 * NFT 티어 아이템 타입 (TierCard에서 사용)
 * - NFT_COLLECTION + 추가 필드
 */
export interface NFTTierItem extends TierData {
  tier: NFTTiers;
  displayName: string;
}

/**
 * 컴포넌트 Props 타입들
 */
declare namespace NFT {
  interface TierCardProps {
    nftData: NFTTierItem; // 변경된 부분
    className?: string;
  }

  interface BenefitListProps {
    benefits: string[];
    className?: string;
  }
}

// 유틸리티 타입
// 기존
// export type TierKeys = keyof typeof NFTTiers; // "TIER1" | "TIER2" | ...

// 제안: 값("1" | "2" …) 자체를 키로 쓰려면
export type TierKeys = NFTTiers; // "1" | "2" | "3" | "4" | "5"
// export type BenefitItem = TierData["BENEFITS"][number];
export type BenefitItem = TierData["BENEFITS"] extends string[]
  ? TierData["BENEFITS"][number]
  : string;

/**
 * API 응답 타입 (예시)
 */
export interface NFTAPIResponse {
  success: boolean;
  data: TierData;
  timestamp: string;
}

export interface NFTMintedEvent {
  txId: string;
  objectId: string;
  tier: number | string;
  minter: string;
  count: number;
  paymentAmount: string;
  imageUrl?: string;
  maxSupply?: number;
}

declare global {
  interface Window {
    __GENESIS_NFT_MODAL?: {
      openEmptyModal: (txId: string) => void;
      setNFTData?: (data: NFTMintedEvent, txId?: string) => void;
      closeModal: () => void;
    };
    __GENESIS_NFT_MODAL_SUI?: {
      openEmptyModal: (txId: string) => void;
      setNFTData?: (data: NFTMintedEvent, txId?: string) => void;
      closeModal: () => void;
    };
  }
}

export interface NFTTierSectionProps {
  tierData: {
    IMAGE: string;
    TITLE: string;
    MAX_SUPPLY: number;
    USD_PRICE: number;
    FULL_DESCRIPTION: string;
    BENEFITS: string[];
    TOKEN_ALLOCATION?: string;
  };
  tier: NFTTiers;
  isEvenTier: boolean;
}

export interface PayAndMintNftButtonProps {
  tierData?: TierData;
  tier: NFTTiers;
}
