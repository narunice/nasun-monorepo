import { useCelebrate, useForceTierDebug } from "../components/celebration";
import { useScratchCardPage } from "../features/scratchcard/hooks/useScratchCardPage";

// New extractions
import { ScratchHeader } from "../features/scratchcard/components/ScratchHeader";
import { ScratchBuyPanel } from "../features/scratchcard/components/ScratchBuyPanel";
import { ScratchResultsGrid } from "../features/scratchcard/components/ScratchResultsGrid";
import { ScratchPrizeTable } from "../features/scratchcard/components/ScratchPrizeTable";
import { NoWinSummaryModal } from "../features/scratchcard/components/ScratchNoWinSummaryModal";
import { NUSDC_UNIT } from "../lib/constants/assets";
import { StreakIndicator } from "../components/StreakIndicator";
import { useActiveAddress } from "../hooks/useActiveAddress";

const CARD_PRICE_NUSDC = 5;

export default function ScratchCardPage() {
  const celebrate = useCelebrate();
  const walletAddress = useActiveAddress();
  const {
    isWalletConnected,
    isBuying,
    error,
    clearError,
    results,
    revealed,
    buyingCount,
    summaryOpen,
    setSummaryOpen,
    onBuy,
    revealAll,
    revealOne,
    totalWinnings,
    hasResults,
  } = useScratchCardPage(celebrate);

  useForceTierDebug("Scratch");

  return (
    <div className="space-y-8 min-h-screen">
      <ScratchHeader />
      <div className="flex justify-end"><StreakIndicator player={walletAddress} /></div>

      {error && (
        <div className="panel p-4 border-red-500/50 bg-red-950/40 flex items-center justify-between gap-3">
          <p className="text-sm text-red-200">{error}</p>
          <button onClick={clearError} className="btn-ghost !py-1 !px-3 text-sm">
            Dismiss
          </button>
        </div>
      )}

      <ScratchBuyPanel onBuy={onBuy} isBuying={isBuying} isWalletConnected={isWalletConnected} buyingCount={buyingCount} />

      {hasResults && (
        <ScratchResultsGrid
          results={results}
          revealed={revealed}
          totalWinnings={totalWinnings}
          onRevealAll={revealAll}
          onRevealOne={revealOne}
        />
      )}

      <ScratchPrizeTable />

      {summaryOpen && (
        <NoWinSummaryModal
          count={results.length}
          wins={results.filter((r) => r.multiplier > 0).length}
          spent={BigInt(results.length) * BigInt(CARD_PRICE_NUSDC) * NUSDC_UNIT}
          won={results.reduce((s, r) => s + r.prizeAmount, 0n)}
          onClose={() => setSummaryOpen(false)}
          onPlayAgain={() => {
            setSummaryOpen(false);
            onBuy(results.length);
          }}
        />
      )}
    </div>
  );
}
