import React from "react";
import { NFTTierItem } from "../../../types/foundersNFTs.d";
import { TierBadge } from "./TierBadge";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";

function TierCardComponent({ nftData }: { nftData: NFTTierItem }) {
  const { t } = useTranslation("sale");

  return (
    <div className="flex flex-col h-full rounded-lg overflow-hidden border border-gray-600 transition-all   relative group">
      <div className="h-48 flex items-center justify-center relative overflow-hidden">
        <img
          src={nftData.IMAGE}
          alt={t(`tiers.tier${nftData.tier}.name`)}
          className="object-cover h-full w-full group-hover:scale-105 transition-transform  "
          loading="lazy"
        />
        <TierBadge
          tier={nftData.tier}
          className="absolute bottom-2 left-2 px-2 py-1 rounded-lg  text-sm"
        />
      </div>

      <div className="flex flex-col flex-grow p-4">
        <div className="flex-grow">
          <h4 className="mb-4">{t(`tiers.tier${nftData.tier}.name`)}</h4>
          <p className="text-sm">Price: {nftData.USD_PRICE} SUI</p>
          <p className="text-sm mb-4">Max Supply: {nftData.MAX_SUPPLY}</p>

          <div className="mb-4">
            <p className="text-sm uppercase">{t("token_allocation.title")}:</p>
            <p className="text-xs">
              {nftData.TOKEN_ALLOCATION} {t("token_allocation.description")}
            </p>
          </div>

          <div className="mb-4">
            <p className="text-sm uppercase ">{t("benefits")}:</p>
            <ul className="text-xs space-y-1 font-light">
              {t(`tiers.tier${nftData.tier}.benefits`, { returnObjects: true }).map(
                (benefit: string, i: number) => (
                  <li key={`${nftData.tier}-benefit-${i}`} className="flex items-start">
                    <span className="mr-1">•</span>
                    {benefit}
                  </li>
                )
              )}
            </ul>
          </div>
        </div>

        <div className="mt-auto pt-1">
          <Button
            onClick={() => {
              const targetId = `tier-section-${nftData.tier.toLowerCase()}`;
              document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
            }}
            variant="default"
            size="default"
            className="w-full"
            aria-label={`Go to mint ${t(`tiers.tier${nftData.tier}.name`)}`}
          >
            Go to Mint
          </Button>
        </div>
      </div>
    </div>
  );
}

export const TierCard = React.memo(TierCardComponent);
