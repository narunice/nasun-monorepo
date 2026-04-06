import { Helmet } from "react-helmet-async";
import { PageLayout } from "@/components/layout/PageLayout";
import { NftDropHeroSection } from "@/sections/wave1/nft-drop/NftDropHeroSection";
import { NftDropMintSection } from "@/sections/wave1/nft-drop/NftDropMintSection";

import { useNftDropRead } from "@/hooks/useNftDrop";

export default function NftDropPage() {
  const { currentStage, mintPrice, isDeployed } = useNftDropRead();

  return (
    <>
      <Helmet>
        <title>Genesis Pass | Nasun</title>
        <meta
          name="description"
          content="Mint your Nasun Genesis Pass. 7 unique video editions on Ethereum mainnet."
        />
      </Helmet>

      <PageLayout
        className="!py-0"
        style={{
          background: "linear-gradient(180deg, #191615 0%, #1f1c1a 50%, #191615 100%)",
        }}
      >
        <NftDropHeroSection />
        <NftDropMintSection
          currentStage={currentStage}
          mintPrice={mintPrice}
          isDeployed={isDeployed}
        />
      </PageLayout>
    </>
  );
}
