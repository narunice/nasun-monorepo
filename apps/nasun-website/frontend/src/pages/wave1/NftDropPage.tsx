import { Helmet } from "react-helmet-async";
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

      <div
        className="min-h-screen w-full"
        style={{
          background: "linear-gradient(180deg, #0f0d0b 0%, #141210 50%, #0f0d0b 100%)",
        }}
      >
        <NftDropHeroSection />
        <NftDropMintSection
          currentStage={currentStage}
          mintPrice={mintPrice}
          isDeployed={isDeployed}
        />
      </div>
    </>
  );
}
