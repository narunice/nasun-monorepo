import { useEffect, useRef } from "react";
import { useCelebrate, tierForCrash } from "../../../components/celebration";
import type { UseCrashResult } from "../useCrash";

export function useCrashCelebration(crash: UseCrashResult) {
  const celebrate = useCelebrate();
  
  // Track our own bet amount so we can compute payout when cashout lands.
  const myBetRef = useRef<bigint>(0n);
  const celebratedCashoutRef = useRef<number | null>(null);
  const celebratedLossRoundRef = useRef<number | null>(null);

  const state = crash.roundState?.state ?? "IDLE";

  // Reset bet tracking on a new round.
  useEffect(() => {
    if (!crash.hasBetThisRound) {
      myBetRef.current = 0n;
      celebratedCashoutRef.current = null;
    }
  }, [crash.hasBetThisRound, crash.roundState?.roundId]);

  // Fire loss celebration
  useEffect(() => {
    if (!crash.hasBetThisRound) return;
    if (myBetRef.current === 0n) return;
    const roundId = crash.roundState?.roundId ?? null;
    if (roundId === null) return;
    if (celebratedLossRoundRef.current === roundId) return;

    const cashoutInvalidated = crash.cashoutSettlement?.status === "invalid";
    const crashedWithoutCashout =
      state === "CRASHED" &&
      crash.myCashoutBps === null &&
      crash.phase !== "cashing_out";

    if (!cashoutInvalidated && !crashedWithoutCashout) return;

    celebratedLossRoundRef.current = roundId;
    celebrate({
      variant: "loss",
      tier: "loss",
      payout: 0n,
      gameLabel: "Crash",
    });
  }, [
    state,
    crash.hasBetThisRound,
    crash.myCashoutBps,
    crash.cashoutSettlement,
    crash.phase,
    crash.roundState?.roundId,
    celebrate,
  ]);

  // Fire WIN celebration
  useEffect(() => {
    const settlement = crash.cashoutSettlement;
    if (!settlement || settlement.status !== "confirmed") return;
    if (celebratedCashoutRef.current === settlement.multiplierBps) return;
    if (myBetRef.current === 0n) return;
    
    celebratedCashoutRef.current = settlement.multiplierBps;
    const multiplier = settlement.multiplierBps / 10_000;
    const tier = tierForCrash(multiplier, true);
    if (tier) {
      celebrate({
        variant: "tiered",
        tier,
        payout: settlement.payout,
        multiplier: Number(multiplier.toFixed(2)),
        gameLabel: "Crash",
      });
    }
  }, [crash.cashoutSettlement, celebrate]);

  return {
    myBetRef,
  };
}
