import { useState } from "react";
import { motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId } from "wagmi";
import { ButtonV3 } from "@/components/ui/button-v3";
import {
  NFT_EDITIONS,
  STAGE_LABELS,
  STAGE_DESCRIPTIONS,
} from "@/constants/nft-drop";
import { NftDropVideoCard } from "./NftDropVideoCard";
import { useNftDropMint, useNftDropRead } from "@/hooks/useNftDrop";

function getEtherscanUrl(chainId: number, txHash: string): string {
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`;
  return `https://etherscan.io/tx/${txHash}`;
}

function MintSuccessView({
  selectedId,
  isSuccess,
  txHash,
  chainId,
  isMetaMaskInApp,
}: {
  selectedId: number | null;
  isSuccess: boolean;
  txHash?: `0x${string}`;
  chainId: number;
  isMetaMaskInApp: boolean;
}) {
  const edition =
    selectedId != null ? NFT_EDITIONS.find((e) => e.id === selectedId) : null;
  const hasFreshMint = isSuccess && edition != null;

  return (
    <div className="flex flex-col items-center py-6 max-w-sm mx-auto">
      {/* NFT visual - only on fresh mint with known edition */}
      {hasFreshMint && (
        <div
          className="relative w-full max-w-xs rounded-2xl overflow-hidden mb-6 border-2 border-amber-400/30"
          style={{ boxShadow: "0 0 60px rgba(249,168,36,0.15)" }}
        >
          <div className="aspect-[3/4] relative">
            <img
              src="/videos/genesis-pass-poster.webp"
              alt={edition.name}
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                filter: `hue-rotate(${selectedId! * 15}deg) saturate(${0.8 + selectedId! * 0.1})`,
              }}
            />
            <video
              src="/videos/Founders-Nft-Portal-Rotate-rf28.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Edition info */}
      {hasFreshMint && (
        <div className="text-center mb-4">
          <h3 className="text-xl font-bold text-nasun-white">{edition.name}</h3>
          <p className="text-sm text-nasun-white/70 mt-1">
            {edition.description}
          </p>
        </div>
      )}

      {/* Success badge */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l5 5L20 7"
              stroke="#22c55e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-green-400 text-lg font-semibold">
          {isSuccess ? "Minted successfully!" : "You own a Genesis Pass"}
        </p>
      </div>

      {/* Etherscan link - subtle text, only on fresh mint */}
      {isSuccess && txHash && (
        <a
          href={getEtherscanUrl(chainId, txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-nasun-c4 text-sm underline mb-6 inline-flex items-center gap-1"
        >
          View transaction
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        </a>
      )}

      {/* Primary CTA */}
      {isMetaMaskInApp ? (
        <p className="text-nasun-white/50 text-sm text-center leading-relaxed max-w-xs">
          Leave this MetaMask browser and return to Chrome to continue exploring
          the Nasun website.
        </p>
      ) : (
        <a href="/my-account?justMinted=genesis-pass">
          <ButtonV3
            variant="c1-gradient"
            size="xl"
            className="!px-10 !py-3.5 !text-base !font-semibold !rounded-xl"
          >
            Check your Genesis Pass
          </ButtonV3>
        </a>
      )}
    </div>
  );
}

interface NftDropMintSectionProps {
  currentStage: number;
  mintPrice: string;
  isDeployed: boolean;
}

export function NftDropMintSection({
  currentStage,
  mintPrice,
  isDeployed,
}: NftDropMintSectionProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { mintPriceWei, hasReachedLimit } = useNftDropRead();
  const {
    mint,
    txHash,
    error,
    isWriting,
    isFetchingSignature,
    isConfirming,
    isSuccess,
    isLoggedIn,
    clearError,
  } = useNftDropMint();

  const isPaused = currentStage === 0;
  const isFree = currentStage === 1;
  const isAllowlistStage = currentStage >= 1 && currentStage <= 3;
  const needsLogin = isAllowlistStage && !isLoggedIn;

  // Mobile browser without MetaMask injected -> should use MetaMask deep link instead of Connect Wallet
  const isMobileNonMetaMask =
    typeof window !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as any).ethereum?.isMetaMask;

  // MetaMask in-app browser on mobile: close the in-app browser to return to Chrome
  const isMetaMaskInApp =
    typeof window !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !!(window as any).ethereum?.isMetaMask;

  const stageLabel = STAGE_LABELS[currentStage] || "Unknown";
  const stageDesc = STAGE_DESCRIPTIONS[currentStage] || "";

  const handleMint = async () => {
    if (selectedId === null) return;
    clearError();
    const price = isFree ? 0n : mintPriceWei || 0n;
    if (!isFree && price === 0n) return;
    await mint(selectedId, price, currentStage);
  };

  const isBusy = isWriting || isFetchingSignature || isConfirming;

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28">
      {/* Stage badge - only when contract is deployed */}
      {isDeployed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center mb-12"
        >
          <div
            className={`
              inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-semibold tracking-wider uppercase
              ${
                isPaused
                  ? "bg-white/[0.06] text-nasun-white/70 border border-white/[0.1]"
                  : "bg-amber-400/10 text-amber-300 border border-amber-400/20"
              }
            `}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isPaused ? "bg-nasun-white/60" : "bg-amber-400 animate-pulse"
              }`}
            />
            {stageLabel}
          </div>
          <p className="text-nasun-white/70 text-sm sm:text-base mt-4 text-center max-w-lg leading-relaxed">
            {stageDesc}
          </p>
        </motion.div>
      )}

      {/* Edition grid - always visible */}
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

      {/* Transfer lock notice */}
      <div className="mt-8 text-center">
        <p className="text-nasun-white/70 text-sm">
          Transfers are locked during the minting period to ensure fair
          distribution.
          <br />
          Trading opens when the drop ends.
        </p>
      </div>

      {/* Mint controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-12 flex flex-col items-center gap-5"
      >
        {!isDeployed ? (
          <div
            className="rounded-2xl border border-white/10 px-8 py-8 text-center max-w-md"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
            }}
          >
            <p className="text-nasun-white/80 text-base">
              Contract not deployed on this network.
            </p>
          </div>
        ) : !isConnected ? (
          isMobileNonMetaMask ? (
            <div
              className="rounded-2xl border border-amber-400/20 px-8 py-8 text-center max-w-lg"
              style={{
                background:
                  "linear-gradient(135deg, rgba(249,168,36,0.06) 0%, rgba(249,168,36,0.02) 100%)",
              }}
            >
              <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-4">
                <img
                  src="/MetaMask_Fox.svg"
                  alt="MetaMask"
                  className="w-7 h-7"
                />
              </div>
              <p className="text-nasun-white text-lg font-semibold mb-2">
                Open in MetaMask to mint
              </p>
              <p className="text-nasun-white/70 text-sm mb-6 leading-relaxed max-w-sm mx-auto">
                Tap the button below to open this page in MetaMask's built-in
                browser, where your wallet connects automatically.
              </p>
              <a
                href={`https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`}
                className="inline-block w-full max-w-xs rounded-xl py-3.5 text-center text-lg font-semibold transition-all"
                style={{
                  background:
                    "linear-gradient(135deg, #E2761B 0%, #CD6116 100%)",
                  color: "#fff",
                }}
              >
                Open in MetaMask
              </a>
            </div>
          ) : (
            <div
              className="rounded-2xl border border-amber-400/20 px-8 py-8 text-center max-w-lg"
              style={{
                background:
                  "linear-gradient(135deg, rgba(249,168,36,0.06) 0%, rgba(249,168,36,0.02) 100%)",
              }}
            >
              <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-4">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f9a824"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="6" width="20" height="14" rx="3" />
                  <path d="M2 10h20" />
                  <circle cx="16" cy="16" r="2" />
                </svg>
              </div>
              <p className="text-nasun-white text-lg font-semibold mb-2">
                Connect wallet to mint
              </p>
              <p className="text-nasun-white/70 text-sm mb-6 leading-relaxed max-w-sm mx-auto">
                Select an edition above, then connect your Ethereum wallet to
                mint your Genesis Pass.
              </p>
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <ButtonV3
                    variant="c1-gradient"
                    size="xl"
                    className="!px-14 !py-4 !text-lg !font-semibold !rounded-xl"
                    onClick={openConnectModal}
                  >
                    Connect Wallet
                  </ButtonV3>
                )}
              </ConnectButton.Custom>
            </div>
          )
        ) : isPaused ? (
          <div className="text-center py-6">
            <p className="text-nasun-white/80 text-base">
              Minting is currently paused. Stay tuned for announcements.
            </p>
          </div>
        ) : needsLogin ? (
          <div className="text-center py-6">
            <p className="text-nasun-white/80 text-base">
              Sign in with your Nasun account to verify allowlist eligibility
              and mint.
            </p>
          </div>
        ) : isSuccess || hasReachedLimit ? (
          <MintSuccessView
            selectedId={selectedId}
            isSuccess={isSuccess}
            txHash={txHash}
            chainId={chainId}
            isMetaMaskInApp={isMetaMaskInApp}
          />
        ) : (
          <>
            {/* Price display */}
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-3xl font-bold text-nasun-white">
                {isFree
                  ? "Free"
                  : mintPriceWei && mintPriceWei > 0n
                    ? `${mintPrice} ETH`
                    : "Price unavailable"}
              </span>
              {!isFree && mintPriceWei && mintPriceWei > 0n && (
                <span className="text-nasun-white/70 text-sm">+ gas</span>
              )}
            </div>

            <ButtonV3
              variant="c1-gradient"
              size="xl"
              className="!px-14 !py-4 !text-lg !font-semibold !rounded-xl"
              disabled={
                selectedId === null ||
                isPaused ||
                isBusy ||
                (!isFree && (!mintPriceWei || mintPriceWei === 0n))
              }
              onClick={handleMint}
            >
              {isFetchingSignature
                ? "Preparing mint..."
                : isWriting
                  ? "Confirm in wallet..."
                  : isConfirming
                    ? "Minting..."
                    : selectedId === null
                      ? "Select an Edition"
                      : `Mint "${NFT_EDITIONS.find((e) => e.id === selectedId)?.name}"`}
            </ButtonV3>

            {selectedId === null && (
              <p className="text-nasun-white/70 text-sm">
                Choose one of the 7 editions above to mint
              </p>
            )}

            {error && (
              <p className="text-red-400 text-base mt-2 text-center max-w-md">
                {error}
              </p>
            )}
          </>
        )}
      </motion.div>
    </section>
  );
}
