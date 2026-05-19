import { useCelebrate, useForceTierDebug } from "../components/celebration";
import { useMinesPage } from "../features/mines/hooks/useMinesPage";

// New extractions
import { MinesHeader } from "../features/mines/components/MinesHeader";
import { MinesBetPanel } from "../features/mines/components/MinesBetPanel";
import { MinesActiveSession } from "../features/mines/components/MinesActiveSession";
import { MinesFinishCard } from "../features/mines/components/MinesFinishCard";
import { StreakIndicator } from "../components/StreakIndicator";
import { useActiveAddress } from "../hooks/useActiveAddress";

export default function MinesPage() {
  const celebrate = useCelebrate();
  const walletAddress = useActiveAddress();
  const {
    isWalletConnected,
    session,
    phase,
    pendingCells,
    error,
    clearError,
    lastFinish,
    clearLastFinish,
    bet,
    setBet,
    mineCount,
    setMineCount,
    maxMul,
    payoutCapNusdc,
    maxBetAllowed,
    onCreate,
    onReveal,
    onCashout,
    onForfeit,
  } = useMinesPage(celebrate);

  useForceTierDebug("Mines");

  if (lastFinish) {
    return (
      <div className="space-y-6">
        <MinesFinishCard finish={lastFinish} onDismiss={clearLastFinish} />
      </div>
    );
  }

  return (
    <div className="space-y-8 min-h-screen">
      <MinesHeader />
      <div className="flex justify-end"><StreakIndicator player={walletAddress} /></div>

      {error && (
        <div className="panel p-4 border-red-500/50 bg-red-950/40 flex items-center justify-between gap-3">
          <p className="text-sm text-red-200">{error}</p>
          <button onClick={clearError} className="btn-ghost !py-1 !px-3 text-sm">
            Dismiss
          </button>
        </div>
      )}

      {!session ? (
        <MinesBetPanel
          bet={bet}
          payoutCapNusdc={payoutCapNusdc}
          mineCount={mineCount}
          maxBetAllowed={maxBetAllowed}
          maxMul={maxMul}
          isWalletConnected={isWalletConnected}
          isCreating={phase === "creating"}
          onBetChange={setBet}
          onMineCountChange={setMineCount}
          onCreate={onCreate}
        />
      ) : (
        <MinesActiveSession session={session} pendingCells={pendingCells} phase={phase} onReveal={onReveal} onCashout={onCashout} onForfeit={onForfeit} />
      )}
    </div>
  );
}
