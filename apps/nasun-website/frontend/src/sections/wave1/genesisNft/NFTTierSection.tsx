import React from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { NFTTierSectionProps } from "../../../types/genesisNFTs.d";
import { PayAndMintNftCard } from "./PayAndMintNftCard";
import { NFTTiers, NFT_COLLECTION } from "../../../constants/pageContent/genesisNFTTiers";

function NFTTierSectionComponent({
  tier,
  isEvenTier,
  currentSupply,
  isSupplyLoading,
}: Omit<NFTTierSectionProps, "tierData"> & { currentSupply?: number; isSupplyLoading: boolean }) {
  const { t } = useTranslation("sale");

  const staticData = NFT_COLLECTION[tier];

  const tierData = {
    ...staticData,
    TITLE: t(`tiers.tier${tier}.name`),
    FULL_DESCRIPTION: t(`tiers.tier${tier}.description`),
    BENEFITS: t(`tiers.tier${tier}.benefits`, { returnObjects: true }) as string[],
    TOKEN_ALLOCATION: staticData.TOKEN_ALLOCATION,
  };

  return (
    <div
      className={`flex flex-col ${
        isEvenTier ? "lg:flex-row-reverse" : "lg:flex-row"
      } gap-4 lg:gap-8 items-stretch p-2 lg:p-5 my-20`}
    >
      {/* 이미지 섹션 */}
      <div className="w-full lg:w-[60%] h-full lg:h-auto overflow-hidden relative">
        <img
          src={tierData.IMAGE}
          alt={tierData.TITLE}
          className="w-full h-full object-cover hover:scale-105 transition-transform  "
          loading="lazy"
          onError={(e) => {
            console.warn(`Failed to load image: ${tierData.IMAGE}`);
            const img = e.target as HTMLImageElement;
            img.src =
              "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjZmFmN2Y0Ii8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMTkxNjE1IiBmb250LXNpemU9IjE2Ij5JbWFnZSBub3QgZm91bmQ8L3RleHQ+Cjwvc3ZnPg==";
            img.alt = `${tierData.TITLE} - Image not available`;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-nasun-black/40 to-transparent pointer-events-none"></div>
      </div>

      {/* 정보 섹션 (40% 너비) */}
      <div className="w-full lg:w-[40%] flex flex-col justify-center">
        <div className="flex justify-end">
          <p className="text-right text-sm lg:text-base">
            {t("tier")} {tier}
          </p>
        </div>
        <div className="flex justify-end">
          <p className="text-sm lg:text-base">
            {t("max_supply")}: {tierData.MAX_SUPPLY}
          </p>
        </div>

        <h2 className="text-3xl lg:text-4xl my-4">{tierData.TITLE}</h2>

        <div className="flex justify-between items-center mb-4">
          <p>${tierData.USD_PRICE} USD</p>
        </div>

        <p className="mb-6">{tierData.FULL_DESCRIPTION}</p>

        <div className="mb-6">
          <h4 className="my-2 font-medium">{t("benefits")}:</h4>
          <ul className="space-y-2 font-light">
            {tierData.BENEFITS.map((benefit: string, i: number) => (
              <li key={i} className="flex items-start text-base">
                <span className="mr-2">•</span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {tierData.TOKEN_ALLOCATION && (
          <div className="mb-7">
            <h4 className="mb-1 font-medium">{t("token_allocation.title")}:</h4>
            <p>
              <span className="mr-2">•</span>
              {tierData.TOKEN_ALLOCATION} {t("token_allocation.description")}
            </p>
          </div>
        )}

        <div className="mt-auto flex justify-center lg:justify-start">
          <PayAndMintNftCard
            tier={tier as NFTTiers}
            tierData={tierData}
            currentSupply={currentSupply}
            isSupplyLoading={isSupplyLoading}
          />
        </div>
      </div>
    </div>
  );
}

export const NFTTierSection = React.memo(NFTTierSectionComponent);
