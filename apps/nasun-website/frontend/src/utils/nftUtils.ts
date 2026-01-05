// src/utils/nftUtils.ts
import { NFTTiers, NFTTierDisplayNames } from "../types/genesisNFTs.d";
import { NFT_COLLECTION } from "../constants/pageContent/genesisNFTTiers";

// 기존 함수 대체 (더 이상 숫자 추출 로직이 필요 없음)
export const getTierDisplayName = (tier: NFTTiers): string => {
  return NFTTierDisplayNames[tier];
};

export function mistToSui(mist: number): number {
  return mist / 1_000_000_000;
}

export const getMaxSupply = (tier: NFTTiers | number): number => {
  const tierKey = typeof tier === "number" ? (tier.toString() as NFTTiers) : tier;
  return NFT_COLLECTION[tierKey]?.MAX_SUPPLY || 0;
};

/**
 * 현재 발행량 대비 최대 발행량 비율 계산
 * @param tier NFT 티어
 * @param currentCount 현재 발행량
 * @returns 백분율 (0~100)
 */
export const getMintProgressPercentage = (tier: NFTTiers, currentCount: number): number => {
  const maxSupply = getMaxSupply(tier);
  return maxSupply > 0 ? Math.min(100, (currentCount / maxSupply) * 100) : 0;
};
