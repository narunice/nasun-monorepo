import React, { useMemo } from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { NFT_COLLECTION } from "../../../constants/pageContent/genesisNFTTiers";
import { NFTTiers } from "../../../types/genesisNFTs.d";
import { getTierDisplayName } from "../../../utils/nftUtils";
import { TierCard } from "./TierCard";

function TiersComparisonSection() {
  const { t } = useTranslation("sale");

  const NFT_TIERS = useMemo(
    () =>
      Object.values(NFTTiers).map((tier) => ({
        tier,
        displayName: getTierDisplayName(tier),
        ...NFT_COLLECTION[tier],
      })),
    []
  );

  return (
    <SectionLayout className="!max-w-8xl">
      <h1 className="leading-snug mb-3 md:mb-4 lg:mb-5">{t("comparison")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {NFT_TIERS.map((nft) => (
          <TierCard key={nft.tier} nftData={nft} />
        ))}
      </div>
    </SectionLayout>
  );
}

export default React.memo(TiersComparisonSection);
