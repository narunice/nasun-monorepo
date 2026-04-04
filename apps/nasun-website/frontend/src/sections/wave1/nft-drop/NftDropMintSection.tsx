import { useState } from "react";
import { motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { parseEther } from "viem";
import { ButtonV3 } from "@/components/ui/button-v3";
import { NFT_EDITIONS, STAGE_LABELS, STAGE_DESCRIPTIONS } from "@/constants/nft-drop";
import { NftDropVideoCard } from "./NftDropVideoCard";
import { useNftDropMint, useNftDropRead } from "@/hooks/useNftDrop";

interface NftDropMintSectionProps {
  currentStage: number;
  mintPrice: string;
}

export function NftDropMintSection({
  currentStage,
  mintPrice,
}: NftDropMintSectionProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { isConnected } = useAccount();
  const { mintPriceWei } = useNftDropRead();
  const { mint, txHash, error, isWriting, isConfirming, isSuccess, clearError } = useNftDropMint();

  const isPaused = currentStage === 0;
  const isFree = currentStage === 1;
  const stageLabel = STAGE_LABELS[currentStage] || "Unknown";
  const stageDesc = STAGE_DESCRIPTIONS[currentStage] || "";

  const handleMint = async () => {
    if (selectedId === null || !mintPriceWei) return;
    clearError();
    await mint(selectedId, 1, isFree ? 0n : mintPriceWei);
  };

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
      {/* Stage badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col items-center mb-10"
      >
        <div
          className={`
            inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase
            ${isPaused
              ? "bg-white/[0.05] text-white/40"
              : "bg-amber-400/10 text-amber-300 border border-amber-400/20"
            }
          `}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isPaused ? "bg-white/30" : "bg-amber-400 animate-pulse"
            }`}
          />
          {stageLabel}
        </div>
        <p className="text-nasun-white/40 text-sm mt-2 text-center max-w-md">
          {stageDesc}
        </p>
      </motion.div>

      {/* Edition grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
        {NFT_EDITIONS.map((edition, i) => (
          <motion.div
            key={edition.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06, duration: 0.5 }}
          >
            <NftDropVideoCard
              id={edition.id}
              name={edition.name}
              description={edition.description}
              selected={selectedId === edition.id}
              onSelect={setSelectedId}
            />
          </motion.div>
        ))}
      </div>

      {/* Mint controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-10 flex flex-col items-center gap-4"
      >
        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <ButtonV3
                variant="c1-gradient"
                size="xl"
                className="!px-14 !py-4 !text-lg !font-semibold !rounded-xl"
                onClick={openConnectModal}
              >
                Connect Wallet to Mint
              </ButtonV3>
            )}
          </ConnectButton.Custom>
        ) : isPaused ? (
          <div className="text-center">
            <p className="text-nasun-white/50 text-sm">
              Minting is currently paused. Stay tuned for announcements.
            </p>
          </div>
        ) : isSuccess ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5L20 7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-green-400 text-lg font-semibold">Minted successfully!</p>
            {txHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-nasun-c4 text-sm underline mt-2 inline-block"
              >
                View on Etherscan
              </a>
            )}
            <div className="mt-4">
              <ButtonV3
                variant="nw2"
                size="md"
                onClick={() => {
                  setSelectedId(null);
                  clearError();
                }}
              >
                Mint Another
              </ButtonV3>
            </div>
          </div>
        ) : (
          <>
            {/* Price display */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-bold text-nasun-white">
                {isFree ? "Free" : `${mintPrice} ETH`}
              </span>
              {!isFree && (
                <span className="text-nasun-white/30 text-sm">+ gas</span>
              )}
            </div>

            <ButtonV3
              variant="c1-gradient"
              size="xl"
              className="!px-14 !py-4 !text-lg !font-semibold !rounded-xl"
              disabled={selectedId === null || isPaused || isWriting || isConfirming}
              onClick={handleMint}
            >
              {isWriting
                ? "Confirm in wallet..."
                : isConfirming
                ? "Minting..."
                : selectedId === null
                ? "Select an Edition"
                : `Mint "${NFT_EDITIONS.find((e) => e.id === selectedId)?.name}"`}
            </ButtonV3>

            {selectedId === null && (
              <p className="text-nasun-white/30 text-xs">
                Choose one of the 7 editions above to mint
              </p>
            )}

            {error && (
              <p className="text-red-400 text-sm mt-2 text-center max-w-md">
                {error}
              </p>
            )}
          </>
        )}
      </motion.div>
    </section>
  );
}
