import { useCelebrate, useForceTierDebug } from "../components/celebration";
import { LOTTERY_TICKET_PRICE, ROUND_STATUS } from "../lib/gostop-config";
import { formatNusdc } from "../lib/format";

import { statusLabel } from "../features/lottery/lottery-utils";
import { useLotteryPage } from "../features/lottery/hooks/useLotteryPage";

// New extractions
import { LotteryRoundHeader } from "../features/lottery/components/LotteryRoundHeader";
import { ClaimBanner, ExpiredBanner } from "../features/lottery/components/LotteryBanners";
import { PickPanel, BuyPanel, QuickBuyPanel } from "../features/lottery/components/LotteryPurchasePanels";
import { MyTickets, PurchaseConfirmModal } from "../features/lottery/components/LotteryTicketManagement";
import { PrizeTable } from "../features/lottery/components/LotteryPrizeTable";

export default function LotteryPage() {
  const celebrate = useCelebrate();
  const {
    picks,
    setPicks,
    quickPickSeed,
    round,
    roundLoading,
    closeMs,
    isRoundOpen,
    isWalletConnected,
    tickets,
    claimSummary,
    error,
    clearError,
    isBuying,
    isClaiming,
    togglePick,
    quickPick,
    onBuy,
    onQuickBuy,
    onClaim,
    onBurn,
    canBuy,
    purchaseConfirm,
    setPurchaseConfirm,
  } = useLotteryPage(celebrate);

  useForceTierDebug("Lottery");

  return (
    <div className="space-y-8 min-h-screen">
      <LotteryRoundHeader
        closeMs={closeMs}
        roundNumber={round?.roundNumber ?? null}
        statusText={round ? statusLabel(round.status) : roundLoading ? "Loading" : "Not started"}
        prizePoolNusdc={round ? formatNusdc(round.prizePool + round.rolloverIn) : "0.00"}
      />

      {error && (
        <div className="panel p-4 border-red-500/50 bg-red-950/40 flex items-center justify-between gap-3">
          <p className="text-sm text-red-200">{error}</p>
          <button onClick={clearError} className="btn-ghost !py-1 !px-3 text-sm">
            Dismiss
          </button>
        </div>
      )}

      <ClaimBanner
        claimable={claimSummary.claimable}
        totalNusdc={claimSummary.totalClaimableNusdc}
        earliestDeadlineMs={claimSummary.earliestDeadlineMs}
        onClaim={onClaim}
        isClaiming={isClaiming}
      />
      <ExpiredBanner expired={claimSummary.expired} />

      <section className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6">
        <PickPanel
          picks={picks}
          onToggle={togglePick}
          onQuickPick={quickPick}
          onClear={() => setPicks([])}
          quickPickSeed={quickPickSeed}
        />
        <BuyPanel
          picks={picks}
          canBuy={canBuy}
          onBuy={onBuy}
          isBuying={isBuying}
          isWalletConnected={isWalletConnected}
          isRoundOpen={isRoundOpen}
        />
      </section>

      <QuickBuyPanel
        onQuickBuy={onQuickBuy}
        isBuying={isBuying}
        isWalletConnected={isWalletConnected}
        isRoundOpen={isRoundOpen}
      />

      <MyTickets
        tickets={tickets}
        round={round}
        onClaim={onClaim}
        onBurn={onBurn}
        isClaiming={isClaiming}
        isWalletConnected={isWalletConnected}
      />

      <PrizeTable />

      {purchaseConfirm && (
        <PurchaseConfirmModal
          count={purchaseConfirm.count}
          picks={purchaseConfirm.picks}
          roundNumber={purchaseConfirm.roundNumber}
          totalCostNusdc={formatNusdc(LOTTERY_TICKET_PRICE * BigInt(purchaseConfirm.count))}
          onClose={() => setPurchaseConfirm(null)}
        />
      )}
    </div>
  );
}
