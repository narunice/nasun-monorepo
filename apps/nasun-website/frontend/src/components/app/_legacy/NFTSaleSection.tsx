import React, { useMemo, useEffect } from "react";
import { NFTTiers } from "../../../types/genesisNFTs.d";
import { NFTTierSection } from "@/components/app/wave1/genesisNft/NFTTierSection";
import { SectionLayout } from "../../layout/SectionLayout";
import { useAllTiersSupplyCounts } from "../../../hooks/PayAndMintNFT/useAllTiersSupplyCounts";
import { toast } from "react-toastify";

function NFTSaleSection() {
  const { counts: supplyCounts, isLoading: isSupplyLoading, isError } = useAllTiersSupplyCounts();

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load NFT supply information. Please refresh the page.", {
        autoClose: 5000,
      });
    }
  }, [isError]);

  const tierOrder = useMemo(
    () => [NFTTiers.TIER1, NFTTiers.TIER2, NFTTiers.TIER3, NFTTiers.TIER4, NFTTiers.TIER5],
    []
  );

  return (
    <SectionLayout className="!max-w-8xl">
      <section className="relative w-full flex-row items-center justify-center my-4 md:my-5 lg:my-6">
        {tierOrder.map((tier, index) => (
          <div key={tier} id={`tier-section-${tier.toLowerCase()}`} className="scroll-mt-0">
            <NFTTierSection
              tier={tier}
              isEvenTier={index % 2 === 1}
              currentSupply={supplyCounts ? supplyCounts[`TIER${tier}`] : undefined}
              isSupplyLoading={isSupplyLoading}
            />
          </div>
        ))}
      </section>
    </SectionLayout>
  );
}

export default React.memo(NFTSaleSection);
