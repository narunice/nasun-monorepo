import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useChainId } from "wagmi";
import { ButtonV3 } from "@/components/ui/button-v3";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/Spinner";
import {
  NFT_EDITIONS,
  STAGE_LABELS,
  getEditionVideoUrl,
  getEditionPosterUrl,
} from "@/constants/nft-drop";
import { GENESIS_PASS_ADDRESSES } from "@/constants/genesis-pass-contract";
import { EditionCarousel } from "./EditionCarousel";
import { useNftDropMint, useNftDropRead } from "@/hooks/useNftDrop";


function getEtherscanUrl(chainId: number, txHash: string): string {
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`;
  return `https://etherscan.io/tx/${txHash}`;
}

/** Minting progress overlay - shown during signature fetch, wallet confirm, and on-chain confirmation */
function MintProgressOverlay({
  isFetchingSignature,
  isWriting,
  isConfirming,
  txHash,
  chainId,
}: {
  isFetchingSignature: boolean;
  isWriting: boolean;
  isConfirming: boolean;
  txHash?: `0x${string}`;
  chainId: number;
}) {
  const isVisible = isFetchingSignature || isWriting || isConfirming;

  const message = isFetchingSignature
    ? "Preparing your mint..."
    : isWriting
      ? "Please confirm in your wallet"
      : "Confirming transaction on-chain...";

  const subMessage = isFetchingSignature
    ? "Verifying eligibility and generating signature"
    : isWriting
      ? "A MetaMask popup should appear. If not, click the MetaMask icon."
      : "This may take up to 30 seconds";

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="flex flex-col items-center gap-5 p-8 max-w-sm text-center"
          >
            <Spinner size="xl" colorClass="text-amber-400" />
            <p className="text-nasun-white text-2xl font-semibold">{message}</p>
            <p className="text-nasun-white/60 text-base">{subMessage}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Success modal shown after mint completes */
function MintSuccessDialog({
  open,
  onClose,
  selectedId,
  txHash,
  chainId,
  isMetaMaskInApp,
  isLoggedIn,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: number | null;
  txHash?: `0x${string}`;
  chainId: number;
  isMetaMaskInApp: boolean;
  isLoggedIn: boolean;
}) {
  const edition =
    selectedId != null ? NFT_EDITIONS.find((e) => e.id === selectedId) : null;
  const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
      )}
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} modal={false}>
        <DialogContent
        className="max-w-sm sm:max-w-md max-h-[90dvh] overflow-y-auto bg-nasun-black border border-amber-400/20 p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* NFT visual */}
        {edition && (
          <div className="relative w-full aspect-square overflow-hidden">
            <video
              src={getEditionVideoUrl(edition.name)}
              poster={getEditionPosterUrl(edition.name)}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-col items-center gap-4 px-6 py-6">
          {/* Heading */}
          <div className="text-center">
            <h2 className="text-xl font-bold text-nasun-white">
              Your Genesis Pass &ldquo;{edition?.name}&rdquo; minted.
            </h2>
            <p className="text-2xl font-bold text-amber-400 mt-1">Welcome to Nasun</p>
          </div>

          {/* Primary CTA */}
          {isMetaMaskInApp ? (
            <div className="text-center space-y-3">
              <p className="text-nasun-white/80 text-sm leading-relaxed">
                Close this browser and return to{" "}
                {isIOS ? "Safari" : "Chrome"} to explore Nasun.
              </p>
              <p className="text-nasun-white/60 text-xs">
                You can check your Genesis Pass on the Account page.
              </p>
            </div>
          ) : isLoggedIn ? (
            <a href="/my-account?justMinted=genesis-pass" className="w-full">
              <ButtonV3
                variant="c1-gradient"
                size="xl"
                className="!w-full !py-3.5 !text-base !font-semibold !rounded-xl"
              >
                Go to My Account
              </ButtonV3>
            </a>
          ) : (
            <ButtonV3
              variant="c1-gradient"
              size="xl"
              className="!w-full !py-3.5 !text-base !font-semibold !rounded-xl"
              onClick={() => {
                localStorage.setItem("auth_return_to", "/my-account?justMinted=genesis-pass");
                window.dispatchEvent(new CustomEvent("nasun:open-login"));
              }}
            >
              Log in to view your Genesis Pass
            </ButtonV3>
          )}

          {/* Etherscan link */}
          {txHash && (
            <a
              href={getEtherscanUrl(chainId, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nasun-c4 text-sm underline inline-flex items-center gap-1"
            >
              View transaction
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}

          {/* Trading notice */}
          <p className="text-nasun-white/70 text-sm text-left mt-2 leading-relaxed">
            Once the drop ends, your Genesis Pass will be tradable
            on OpenSea and other marketplaces.
          </p>
        </div>
        </DialogContent>
      </Dialog>
    </>
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
}: NftDropMintSectionProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [successDismissed, setSuccessDismissed] = useState(false);
  const { address } = useAccount();
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
    isCooldown,
    cooldownRemaining,
    clearError,
  } = useNftDropMint();

  const isFree = currentStage === 1;

  const isMetaMaskInApp =
    typeof window !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !!(window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask;

  const stageLabel = STAGE_LABELS[currentStage] || "Unknown";

  const handleMint = async () => {
    if (selectedId === null) return;
    setSuccessDismissed(false);
    clearError();
    const price = isFree ? 0n : mintPriceWei || 0n;
    if (!isFree && price === 0n) return;
    await mint(selectedId, price, currentStage);
  };

  const isBusy = isWriting || isFetchingSignature || isConfirming || isCooldown;

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28">
      {/* Minting progress overlay */}
      <MintProgressOverlay
        isFetchingSignature={isFetchingSignature}
        isWriting={isWriting}
        isConfirming={isConfirming}
        txHash={txHash}
        chainId={chainId}
      />

      {/* Success modal */}
      <MintSuccessDialog
        open={isSuccess && !successDismissed}
        onClose={() => setSuccessDismissed(true)}
        selectedId={selectedId}
        txHash={txHash}
        chainId={chainId}
        isMetaMaskInApp={isMetaMaskInApp}
        isLoggedIn={isLoggedIn}
      />

      {/* Stage badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="relative flex items-center justify-center mb-12"
      >
        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-semibold tracking-wider uppercase bg-amber-400/10 text-amber-300 border border-amber-400/20">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          {stageLabel}
        </div>
      </motion.div>

      {/* Edition carousel */}
      <EditionCarousel selectedId={selectedId} onSelect={setSelectedId} />

      {/* Mint controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-12 flex flex-col items-center gap-5"
      >
        {isSuccess || hasReachedLimit ? (
          <div className="flex flex-col items-center py-6 gap-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5L20 7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-green-400 text-lg font-semibold">You own a Genesis Pass</p>
            </div>

            {/* Owner actions */}
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              {isLoggedIn ? (
                <a
                  href="/my-account"
                  className="inline-flex items-center justify-center px-6 py-3 bg-nasun-white text-nasun-black font-semibold text-sm rounded-lg hover:bg-nasun-white/90 transition-colors"
                >
                  Check your Genesis Pass
                </a>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center justify-center px-6 py-3 bg-nasun-white text-nasun-black font-semibold text-sm rounded-lg hover:bg-nasun-white/90 transition-colors"
                  onClick={() => {
                    localStorage.setItem("auth_return_to", "/my-account");
                    window.dispatchEvent(new CustomEvent("nasun:open-login"));
                  }}
                >
                  Check your Genesis Pass
                </button>
              )}
              <a
                href={`${chainId === 11155111 ? "https://sepolia.etherscan.io" : "https://etherscan.io"}/address/${GENESIS_PASS_ADDRESSES[chainId] ?? ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-nasun-white/60 text-nasun-white font-semibold text-sm rounded-lg hover:border-nasun-white hover:bg-nasun-white/5 transition-colors"
              >
                <span>View on Etherscan</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          </div>
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
                isBusy ||
                (!isFree && (!mintPriceWei || mintPriceWei === 0n))
              }
              onClick={handleMint}
            >
              {isCooldown
                ? `Please wait ${cooldownRemaining}s`
                : isFetchingSignature
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


      {/* Transfer lock notice */}
      <div className="mt-12 max-w-lg mx-auto">
        <p className="inline-flex items-start gap-2 text-nasun-white/50 text-sm leading-relaxed">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-nasun-white/40" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
          <span>
            Transfers are locked during the minting period to ensure fair
            distribution. <br />
            Trading opens when the drop ends.
          </span>
        </p>
      </div>
    </section>
  );
}
