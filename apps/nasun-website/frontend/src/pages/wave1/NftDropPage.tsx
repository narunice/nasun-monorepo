import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { NftDropHeroSection } from "@/sections/wave1/nft-drop/NftDropHeroSection";
import { NftDropMintSection } from "@/sections/wave1/nft-drop/NftDropMintSection";

import { useNftDropRead } from "@/hooks/useNftDrop";

const isDev = import.meta.env.MODE === "development";

export default function NftDropPage() {
  const { currentStage, mintPrice, isDeployed } = useNftDropRead();
  const [searchParams] = useSearchParams();

  // Force black background on footer
  useEffect(() => {
    document.documentElement.classList.add("genesis-drop-theme");
    return () =>
      document.documentElement.classList.remove("genesis-drop-theme");
  }, []);

  // Dev-only: ?stage=1 to override contract stage for UI testing
  const stageOverride = isDev ? searchParams.get("stage") : null;
  const effectiveStage = stageOverride != null ? Number(stageOverride) : currentStage;

  return (
    <>
      <Helmet>
        <title>Genesis Pass | Nasun</title>
        <meta
          name="description"
          content="Mint your Nasun Genesis Pass. 8 unique video editions on Ethereum mainnet."
        />
      </Helmet>

      <PageLayout
        className="!py-0"
        style={{
          background: "#000000",
        }}
      >
        <NftDropHeroSection />
        <NftDropMintSection
          currentStage={effectiveStage}
          mintPrice={mintPrice}
          isDeployed={isDeployed}
        />
      </PageLayout>
    </>
  );
}
