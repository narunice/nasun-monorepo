import { useState, useEffect, useRef, useCallback } from "react";
import { useScratchCard, type ScratchResult } from "../useScratchCard";
import { useToast } from "../../../components/ui/Toast";
import { useCelebrate, tierForScratch } from "../../../components/celebration";
import { useInvalidateGameHistory } from "../../game-history";

const CARD_PRICE_NUSDC = 5;

export function useScratchCardPage(celebrate: any) {
  const { isWalletConnected, buy, isBuying, error, clearError } = useScratchCard();
  const { showToast } = useToast();
  const invalidateHistory = useInvalidateGameHistory();

  const [results, setResults] = useState<ScratchResult[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [buyingCount, setBuyingCount] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const summaryShownForRef = useRef<string | null>(null);
  const celebratedBatchRef = useRef<string | null>(null);

  const onBuy = useCallback(async (count: number) => {
    setResults([]);
    setRevealed(new Set());
    celebratedBatchRef.current = null;
    setBuyingCount(count);
    try {
      const out = await buy(count);
      if (!out) return;
      setResults(out);
      showToast(`${out.length} card${out.length === 1 ? "" : "s"} purchased — tap to reveal`, "info");
      invalidateHistory();
    } finally {
      setBuyingCount(null);
    }
  }, [buy, showToast, invalidateHistory]);

  useEffect(() => {
    if (results.length === 0) return;
    if (revealed.size !== results.length) return;

    const batchKey = results.map((r) => `${r.cardId}:${r.bulkIndex}`).join(",");
    if (celebratedBatchRef.current === batchKey) return;
    celebratedBatchRef.current = batchKey;

    const totalPrize = results.reduce((s, r) => s + r.prizeAmount, 0n);
    const wins = results.filter((r) => r.multiplier > 0).length;
    const spent = BigInt(results.length) * BigInt(CARD_PRICE_NUSDC) * 1_000_000n;
    const isProfit = totalPrize > spent;

    if (isProfit) {
      const whole = (totalPrize - spent) / 1_000_000n;
      const frac = Number((totalPrize - spent) % 1_000_000n) / 1_000_000;
      const netStr = (Number(whole) + frac).toFixed(2);
      
      showToast(`${wins}/${results.length} won · +${netStr} net`, "success");
      
      const maxMultiplier = results.reduce((m, r) => Math.max(m, r.multiplier), 0);
      const tier = tierForScratch(maxMultiplier);
      if (tier) {
        celebrate({
          variant: "tiered",
          tier,
          payout: totalPrize,
          multiplier: maxMultiplier,
          gameLabel: "Scratch",
        });
      }
    } else if (summaryShownForRef.current !== batchKey) {
      summaryShownForRef.current = batchKey;
      setSummaryOpen(true);
    }
  }, [revealed, results, celebrate, showToast]);

  const revealAll = useCallback(() => {
    setRevealed(new Set(results.map((_, i) => i)));
  }, [results]);

  const revealOne = useCallback((index: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const totalWinnings = results
    .filter((_, i) => revealed.has(i))
    .reduce((s, r) => s + r.prizeAmount, 0n);
  const hasResults = results.length > 0;
  const allRevealed = hasResults && revealed.size === results.length;

  return {
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
    allRevealed,
  };
}
