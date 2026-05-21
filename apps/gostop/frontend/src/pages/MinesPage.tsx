import { useState } from "react";
import { useCelebrate, useForceTierDebug } from "../components/celebration";
import { useMinesPage } from "../features/mines/hooks/useMinesPage";

// New extractions
import { MinesHeader } from "../features/mines/components/MinesHeader";
import { MinesBetPanel } from "../features/mines/components/MinesBetPanel";
import { MinesActiveSession } from "../features/mines/components/MinesActiveSession";
import { MinesFinishCard } from "../features/mines/components/MinesFinishCard";

export default function MinesPage() {
  const celebrate = useCelebrate();
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

  const [stuckHelpOpen, setStuckHelpOpen] = useState(false);

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
        <>
          <MinesActiveSession session={session} pendingCells={pendingCells} phase={phase} onReveal={onReveal} onCashout={onCashout} />

          {/* Stuck-session escape hatch. Hidden behind a small disclosure
              so it doesn't compete visually with the Cashout button during
              normal play. Forfeit irreversibly loses the bet. */}
          <div className="text-center text-xs text-neutral-500">
            {!stuckHelpOpen ? (
              <button
                onClick={() => setStuckHelpOpen(true)}
                className="hover:text-neutral-300 underline-offset-4 hover:underline"
              >
                Session stuck?
              </button>
            ) : (
              <div className="space-y-2 max-w-md mx-auto">
                <p className="text-neutral-400">
                  Only forfeit if the game is unresponsive. Your bet will be lost.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setStuckHelpOpen(false)}
                    className="px-3 py-1 text-neutral-400 hover:text-neutral-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Forfeit this session? Your bet will be lost.')) {
                        onForfeit();
                        setStuckHelpOpen(false);
                      }
                    }}
                    disabled={phase !== "idle"}
                    className="px-3 py-1 text-red-300 hover:text-red-200 disabled:opacity-50"
                  >
                    {phase === "forfeiting" ? "Forfeiting…" : "Forfeit session"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
