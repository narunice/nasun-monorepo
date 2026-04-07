import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { Spinner } from "@/components/ui/Spinner";
import { ButtonV3 } from "@/components/ui/button-v3";
import { NftDropHeroSection } from "@/sections/wave1/nft-drop/NftDropHeroSection";
import { NftDropMintSection } from "@/sections/wave1/nft-drop/NftDropMintSection";
import { DisconnectedView } from "@/sections/wave1/nft-drop/DisconnectedView";
import { GateModal } from "@/sections/wave1/nft-drop/GateModal";
import { IneligibleCountdown } from "@/sections/wave1/nft-drop/IneligibleCountdown";
import { useNftDropRead } from "@/hooks/useNftDrop";
import { useGenesisPassOwnership } from "@/hooks/useGenesisPassOwnership";
import { useDropPageState } from "@/hooks/useDropPageState";

const isDev = import.meta.env.MODE === "development";

export default function NftDropPage() {
  const { currentStage, mintPrice, isDeployed, hasReachedLimit } = useNftDropRead();
  const { address } = useAccount();
  const { hasMinted, isLoading: ownershipLoading } = useGenesisPassOwnership(address);
  const [searchParams] = useSearchParams();

  // Dev-only: ?stage=N to override UI display stage for testing (0-4 only)
  const stageOverride = isDev ? searchParams.get("stage") : null;
  const parsedOverride = stageOverride != null ? Number(stageOverride) : NaN;
  const effectiveStage =
    !isNaN(parsedOverride) && parsedOverride >= 0 && parsedOverride <= 4
      ? parsedOverride
      : currentStage;

  const state = useDropPageState({
    currentStage: effectiveStage,
    hasMinted,
    hasReachedLimit,
    ownershipLoading,
    address,
  });

  // Force black background on footer
  useEffect(() => {
    document.documentElement.classList.add("genesis-drop-theme");
    return () =>
      document.documentElement.classList.remove("genesis-drop-theme");
  }, []);

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
        style={{ background: "#000000" }}
      >
        <NftDropHeroSection showSubtitle={false} />

        {/* DISCONNECTED: Connect Wallet */}
        {state.phase.type === "DISCONNECTED" && (
          <DisconnectedView isDeployed={isDeployed} isDropEnded={state.isDropEnded} />
        )}

        {/* CHECKING: Loading spinner */}
        {state.phase.type === "CHECKING" && (
          <section className="min-h-[40vh] flex flex-col items-center justify-center gap-4">
            <Spinner size="xl" colorClass="text-amber-400" />
            <p className="text-nasun-white/60 text-sm">Checking eligibility...</p>
          </section>
        )}

        {/* ERROR: Retry */}
        {state.phase.type === "ERROR" && (
          <section className="min-h-[40vh] flex flex-col items-center justify-center gap-5 px-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-nasun-white/80 text-base text-center max-w-md">
              {state.phase.message}
            </p>
            <ButtonV3
              variant="c1-gradient"
              size="lg"
              className="!px-10 !py-3 !rounded-xl"
              onClick={state.retry}
            >
              Try Again
            </ButtonV3>
          </section>
        )}

        {/* GATED: Gate modal (always mounted for close animation) */}
        {state.phase.type === "GATED" && (
          <>
            <GateModal
              open={state.phase.modalOpen}
              eligible={state.phase.eligible}
              eligibility={state.phase.eligibility}
              onProceed={state.proceedToMint}
              onClose={state.closeGateModal}
            />

            {/* Ineligible countdown (shown after modal closes) */}
            {!state.phase.modalOpen && (
              <IneligibleCountdown
                currentStage={effectiveStage}
                eligibility={state.phase.eligibility}
              />
            )}
          </>
        )}

        {/* MINT_READY: Full mint UI */}
        {state.phase.type === "MINT_READY" && (
          <ErrorBoundary
            fallback={
              <div className="text-center py-20 text-nasun-white/70">
                <p className="text-lg font-semibold mb-2">Something went wrong</p>
                <p className="text-sm">Please refresh the page to try again.</p>
              </div>
            }
          >
            <NftDropMintSection
              currentStage={effectiveStage}
              mintPrice={mintPrice}
              isDeployed={isDeployed}
            />
          </ErrorBoundary>
        )}
      </PageLayout>
    </>
  );
}
