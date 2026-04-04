import { Helmet } from "react-helmet-async";
import { NftDropHeroSection } from "@/sections/wave1/nft-drop/NftDropHeroSection";
import { NftDropMintSection } from "@/sections/wave1/nft-drop/NftDropMintSection";
import { MetaMaskRedirectBanner } from "@/sections/wave1/nft-drop/MetaMaskRedirectBanner";

export default function NftDropPage() {
  // TODO: Read from contract on-chain (Phase 5 integration)
  const currentStage = 0; // PAUSED
  const mintPrice = "0.05";

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
        />
        <MetaMaskRedirectBanner />
      </div>
    </>
  );
}
