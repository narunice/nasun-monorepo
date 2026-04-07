import { useState } from "react";
import { motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId } from "wagmi";
import { ButtonV3 } from "@/components/ui/button-v3";
import {
  NFT_EDITIONS,
  STAGE_LABELS,
  STAGE_START_TIMES,
} from "@/constants/nft-drop";
import { GENESIS_PASS_ADDRESSES } from "@/constants/genesis-pass-contract";
import { EditionCarousel } from "./EditionCarousel";
import { useNftDropMint, useNftDropRead } from "@/hooks/useNftDrop";
import { useGenesisPassOwnership } from "@/hooks/useGenesisPassOwnership";

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
        <div className="text-center max-w-xs space-y-2">
          <p className="text-amber-400 text-sm font-semibold">
            Close this MetaMask browser and open nasun.io in{" "}
            {/iPhone|iPad|iPod/i.test(navigator.userAgent) ? "Safari" : "Chrome"}{" "}
            to check your Genesis Pass.
          </p>
          <p className="text-nasun-white/40 text-xs">
            MetaMask in-app browser does not support full site navigation.
          </p>
        </div>
      ) : (
        <a href="/my-account?justMinted=genesis-pass">
          <ButtonV3
            variant="c1-gradient"
            size="xl"
            className="!px-10 !py-3.5 !text-base !font-semibold !rounded-xl"
          >
            Go to My Account
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
  const { address, isConnected } = useAccount();
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
    clearError,
  } = useNftDropMint();

  const { hasMinted: alreadyOwns } = useGenesisPassOwnership(address);

  const isPaused = currentStage === 0;
  const isFree = currentStage === 1;

  // Mobile browser without MetaMask injected -> should use MetaMask deep link instead of Connect Wallet
  const isMobileNonMetaMask =
    typeof window !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask;

  // MetaMask in-app browser on mobile: close the in-app browser to return to Chrome
  const isMetaMaskInApp =
    typeof window !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !!(window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask;

  const stageLabel = STAGE_LABELS[currentStage] || "Unknown";

  // Build contextual status message based on user state.
  // currentStage from the contract is the source of truth: if a stage is active on-chain, minting is open.
  const statusMessage = (() => {
    if (!isConnected) return null;
    if (alreadyOwns || hasReachedLimit) return "You own a Genesis Pass.";
    if (isPaused) {
      const nextStage = STAGE_START_TIMES[1];
      if (nextStage && nextStage.getTime() > Date.now()) {
        const diff = nextStage.getTime() - Date.now();
        const hours = Math.floor(diff / 3_600_000);
        const mins = Math.floor((diff % 3_600_000) / 60_000);
        const dateStr = nextStage.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
        const timeStr = nextStage.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "UTC",
        });
        return `Minting opens in ${hours}h ${mins}m, from ${dateStr} ${timeStr} UTC.`;
      }
      return "Minting is currently paused. Stay tuned.";
    }
    return "You are eligible to mint now.";
  })();

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
          className="relative flex items-center justify-center mb-12"
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
          {statusMessage && (
            <span className="hidden sm:block absolute right-0 text-sm text-nasun-white/70">
              {statusMessage}
            </span>
          )}
        </motion.div>
      )}

      {/* Edition carousel */}
      <EditionCarousel selectedId={selectedId} onSelect={setSelectedId} />

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
          isMobileNonMetaMask ? null : (
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
            <p className="text-nasun-white/70 text-sm mb-6 leading-relaxed max-w-[360px] mx-auto">
              Connect your Ethereum wallet to check your eligibility and mint
              your Genesis Pass.
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

            {error && (
              <p className="text-red-400 text-base mt-2 text-center max-w-md">
                {error}
              </p>
            )}
          </>
        )}
      </motion.div>

      {/* Possession & Powers */}
      <div className="mt-16 max-w-lg mx-auto space-y-10">
        <div className="space-y-3">
          <h3 className="text-base font-semibold tracking-[0.3em] uppercase text-amber-400/80">
            Possession
          </h3>
          <p className="text-nasun-white/80 leading-relaxed">
            The Genesis Pass grants access to the Nasun ecosystem, where the
            community reconfigures the simulation from its collective
            imagination. Activate your pass to unlock utilities that expand
            alongside the growth of Nasun.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold tracking-[0.3em] uppercase text-amber-400/80">
            Powers
          </h3>
          <p className="text-nasun-white/80 uppercase tracking-widest">
            What you unlock
          </p>
          <ul className="text-nasun-white/80 text-sm space-y-1.5 list-disc list-inside">
            <li>Early access to Nasun apps</li>
            <li>2x Boost in number and quality of rewards</li>
            <li>Exclusive events and allowlists</li>
          </ul>
        </div>
      </div>

      {/* Owner-only actions */}
      {(alreadyOwns || hasReachedLimit) && (
        <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
          <a
            href="/my-account"
            className="inline-flex items-center justify-center px-6 py-3 bg-nasun-white text-nasun-black font-semibold text-sm rounded-lg hover:bg-nasun-white/90 transition-colors"
          >
            Check your Genesis Pass
          </a>
          <a
            href={`${chainId === 11155111 ? "https://sepolia.etherscan.io" : "https://etherscan.io"}/address/${GENESIS_PASS_ADDRESSES[chainId] ?? ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-nasun-white/60 text-nasun-white font-semibold text-sm rounded-lg hover:border-nasun-white hover:bg-nasun-white/5 transition-colors"
          >
            <span>View on Etherscan</span>
            <svg
              className="w-4 h-4"
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
        </div>
      )}

      {/* Transfer lock notice */}
      <div className="mt-12 max-w-lg mx-auto">
        <p className="inline-flex items-start gap-2 text-nasun-white/50 text-sm leading-relaxed">
          <svg
            className="w-4 h-4 flex-shrink-0 mt-0.5 text-nasun-white/40"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            Transfers are locked during the minting period to ensure fair
            distribution. <br />
            Trading opens when the drop ends.
          </span>
        </p>
      </div>
      {/* MetaMask info card for mobile (below transfer lock) */}
      {isMobileNonMetaMask &&
        !isConnected &&
        !(isSuccess || hasReachedLimit) && (
          <div
            className="mt-10 rounded-2xl border border-amber-400/20 px-8 py-6 text-center max-w-lg mx-auto sm:hidden"
            style={{
              background:
                "linear-gradient(135deg, rgba(249,168,36,0.06) 0%, rgba(249,168,36,0.02) 100%)",
            }}
          >
            <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-4">
              <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-7 h-7" />
            </div>
            <p className="text-nasun-white text-lg font-semibold mb-2">
              Open in MetaMask
            </p>
            <p className="text-nasun-white/70 text-sm leading-relaxed max-w-sm mx-auto">
              Tap the button at the bottom of your screen to open this page in
              MetaMask's built-in browser, where your wallet connects
              automatically.
            </p>
          </div>
        )}

      {/* Mobile sticky bottom bar for MetaMask deep link */}
      {isMobileNonMetaMask &&
        !isConnected &&
        !(isSuccess || hasReachedLimit) && (
          <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden px-4 pb-4 pt-3 bg-gradient-to-t from-black via-black/95 to-transparent">
            <a
              href={`https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`}
              className="flex items-center justify-center gap-3 w-full rounded-xl py-3 text-left transition-all"
              style={{
                background: "linear-gradient(135deg, #E2761B 0%, #CD6116 100%)",
                color: "#fff",
              }}
            >
              <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                <img src="/MetaMask_Fox.svg" alt="" className="w-4.5 h-4.5" />
              </span>
              <span className="flex flex-col">
                <span className="text-base font-semibold leading-tight">
                  Open in MetaMask to Mint
                </span>
                <span className="text-[11px] text-white/70 leading-tight">
                  For a better mobile minting experience
                </span>
              </span>
            </a>
          </div>
        )}
    </section>
  );
}
