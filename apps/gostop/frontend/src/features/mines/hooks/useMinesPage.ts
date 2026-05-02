import { useState, useEffect, useRef, useCallback } from "react";
import { useMines } from "../useMines";
import { useCelebrate, tierForMines } from "../../../components/celebration";
import { useInvalidateGameHistory } from "../../game-history";
import { useToast } from "../../../components/ui/Toast";
import { MINES_MAX_BET, MINES_MAX_SINGLE_PAYOUT } from "../../../lib/gostop-config";
import { maxMultiplierBps, computeMultiplierBps } from "../mines-config";
import { NUSDC_UNIT_NUMBER } from "../../../lib/constants/assets";

const DEFAULT_BET_NUSDC = 1;

export function useMinesPage(celebrate: any) {
  const {
    isWalletConnected,
    session,
    phase,
    pendingCells,
    createSession,
    revealCell,
    cashout,
    error,
    clearError,
    lastFinish,
    clearLastFinish,
  } = useMines();
  const { showToast } = useToast();
  const invalidateHistory = useInvalidateGameHistory();

  const [bet, setBet] = useState<number>(DEFAULT_BET_NUSDC);
  const [mineCount, setMineCount] = useState<number>(3);

  const celebratedFinishRef = useRef<typeof lastFinish>(null);

  useEffect(() => {
    if (!lastFinish) {
      celebratedFinishRef.current = null;
      return;
    }
    if (celebratedFinishRef.current === lastFinish) return;
    celebratedFinishRef.current = lastFinish;
    invalidateHistory();
    if (lastFinish.kind !== "cashed_out") return;
    if (lastFinish.bet === 0n) return;
    
    const multBps = Number((lastFinish.payout * 10_000n) / lastFinish.bet);
    const multiplier = multBps / 10_000;
    const tier = tierForMines(multiplier);
    if (tier) {
      celebrate({
        variant: "tiered",
        tier,
        payout: lastFinish.payout,
        multiplier: Number(multiplier.toFixed(2)),
        gameLabel: "Mines",
      });
    }
  }, [lastFinish, celebrate, invalidateHistory]);

  const maxMul = maxMultiplierBps(mineCount) / 10_000;
  const payoutCapNusdc = Number(MINES_MAX_SINGLE_PAYOUT) / NUSDC_UNIT_NUMBER;
  const maxBetAllowed = Number(MINES_MAX_BET) / NUSDC_UNIT_NUMBER;
  const betCapped = Math.min(bet, maxBetAllowed);
  const betMist = BigInt(Math.floor(betCapped * NUSDC_UNIT_NUMBER));

  const onCreate = useCallback(async () => {
    if (!isWalletConnected) return;
    const ok = await createSession(betMist, mineCount);
    if (!ok) return;
    showToast(`Session started: ${betCapped.toFixed(2)} NUSDC · ${mineCount} mines`, "info");
  }, [isWalletConnected, createSession, betMist, mineCount, betCapped, showToast]);

  const onReveal = useCallback(async (i: number) => {
    await revealCell(i);
  }, [revealCell]);

  const onCashout = useCallback(async () => {
    const ok = await cashout();
    if (ok) {
      const currentMul = session ? computeMultiplierBps(session.mineCount, session.safeReveals) / 10_000 : 1;
      showToast(`Cashed out at ${currentMul.toFixed(2)}×`, "success");
    }
  }, [cashout, session, showToast]);

  return {
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
  };
}
