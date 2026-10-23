import { useState, useEffect, useRef, useCallback } from "react";
import { useScratchCard, type ScratchResult } from "../useScratchCard";
import { useToast } from "../../../components/ui/Toast";
import { tierForScratch } from "../../../components/celebration";
import { useInvalidateGameHistory } from "../../game-history";
import { NUSDC_UNIT_NUMBER, NUSDC_UNIT } from "../../../lib/constants/assets";
import { useBalanceStore } from "../../../store/useBalanceStore";

const CARD_PRICE_NUSDC = 5;

// Pending batch is persisted per wallet so a reload / back-navigation before
// the user finishes revealing does not lose the cards. The on-chain outcome
// (and any prize) is already settled at purchase, so this only restores the
// reveal *experience*; loser cards leave no on-chain object, which is why we
// cannot reconstruct the batch from getOwnedObjects and persist it here
// instead. Storage is cleared once the batch is fully revealed.
const PENDING_PREFIX = "gostop:scratch:pending:";

interface StoredResult {
  cardId: number;
  cardNftId: string | null;
  multiplier: number;
  prizeAmount: string; // bigint serialized as decimal string
  bulkIndex: number;
}

function loadPending(walletAddress: string): {
  results: ScratchResult[];
  revealed: number[];
} | null {
  try {
    const raw = localStorage.getItem(PENDING_PREFIX + walletAddress);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { results: StoredResult[]; revealed: number[] };
    if (!Array.isArray(parsed.results) || parsed.results.length === 0) return null;
    return {
      results: parsed.results.map((r) => ({
        cardId: r.cardId,
        cardNftId: r.cardNftId,
        multiplier: r.multiplier,
        prizeAmount: BigInt(r.prizeAmount),
        bulkIndex: r.bulkIndex,
      })),
      revealed: Array.isArray(parsed.revealed) ? parsed.revealed : [],
    };
  } catch {
    return null; // malformed entry — treat as no pending batch
  }
}

export function useScratchCardPage(celebrate: any) {
  const { walletAddress, isWalletConnected, buy, isBuying, error, clearError, refreshBalance } = useScratchCard();
  const { showToast } = useToast();
  const invalidateHistory = useInvalidateGameHistory();

  const [results, setResults] = useState<ScratchResult[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [buyingCount, setBuyingCount] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const summaryShownForRef = useRef<string | null>(null);
  const celebratedBatchRef = useRef<string | null>(null);
  const hydratedForRef = useRef<string | null>(null);

  // Restore a pending batch for the active wallet on mount / wallet switch.
  // Runs once per wallet address (guarded) so it never clobbers a batch the
  // user buys afterward in the same session.
  useEffect(() => {
    if (!walletAddress) return;
    if (hydratedForRef.current === walletAddress) return;
    hydratedForRef.current = walletAddress;

    const pending = loadPending(walletAddress);
    if (!pending) {
      // Switching to a wallet with no stored batch clears any prior display.
      setResults([]);
      setRevealed(new Set());
      return;
    }
    setResults(pending.results);
    setRevealed(new Set(pending.revealed));

    // A fully revealed restored batch must not re-fire celebration / summary.
    if (pending.revealed.length === pending.results.length) {
      const batchKey = pending.results.map((r) => `${r.cardId}:${r.bulkIndex}`).join(",");
      celebratedBatchRef.current = batchKey;
      summaryShownForRef.current = batchKey;
    }
  }, [walletAddress]);

  // Persist the pending batch while it has unrevealed cards; drop it once the
  // user has revealed everything (or there is nothing to keep). Skipping the
  // empty-results case avoids wiping storage during the hydration commit.
  useEffect(() => {
    if (!walletAddress) return;
    if (hydratedForRef.current !== walletAddress) return;
    const key = PENDING_PREFIX + walletAddress;
    try {
      if (results.length > 0 && revealed.size < results.length) {
        const payload = {
          results: results.map((r) => ({
            cardId: r.cardId,
            cardNftId: r.cardNftId,
            multiplier: r.multiplier,
            prizeAmount: r.prizeAmount.toString(),
            bulkIndex: r.bulkIndex,
          })),
          revealed: Array.from(revealed),
        };
        localStorage.setItem(key, JSON.stringify(payload));
      } else if (results.length > 0) {
        // Fully revealed — the reveal experience is complete, stop persisting.
        localStorage.removeItem(key);
      }
    } catch {
      /* quota or serialization error — non-fatal, batch simply not persisted */
    }
  }, [walletAddress, results, revealed]);

  // Deferring the purchase-time refresh only silences one writer: useBalanceSync
  // polls every 15s, so a poll landing while cards are still face-down moves the
  // Available figure and gives the batch away before the user scratches it. Hold
  // the balance for as long as the batch has unrevealed cards. The hold waits for
  // a known balance, because staging the very first fetch away would leave
  // Available reading 0 for a batch restored from storage.
  const holdForReveal = useBalanceStore((s) => s.holdForReveal);
  const releaseReveal = useBalanceStore((s) => s.releaseReveal);
  const balanceKnown = useBalanceStore((s) => s.isInitialized);
  const holdingRef = useRef(false);
  // A purchase in flight counts as unrevealed: executeGameTx waits for the tx
  // to settle, and the cards are face down for that whole window. Leaving it
  // out would let this effect run on the re-render that starts the purchase
  // and release the hold onBuy had just taken.
  const hasUnrevealed =
    balanceKnown && (buyingCount !== null || (results.length > 0 && revealed.size < results.length));

  // Declared ahead of the reveal-complete effect so the release (and the staged
  // balance it flushes) lands before that effect's refresh.
  useEffect(() => {
    if (hasUnrevealed === holdingRef.current) return;
    holdingRef.current = hasUnrevealed;
    if (hasUnrevealed) holdForReveal();
    else releaseReveal();
  }, [hasUnrevealed, holdForReveal, releaseReveal]);

  // Leaving the page mid-reveal must not strand the hold, which would freeze the
  // displayed balance for the rest of the session.
  useEffect(
    () => () => {
      if (holdingRef.current) {
        holdingRef.current = false;
        releaseReveal();
      }
    },
    [releaseReveal],
  );

  const onBuy = useCallback(async (count: number) => {
    setBuyingCount(count);
    // Take the hold here rather than waiting for the effect's next run, so the
    // settle window is covered from the first instruction, the way WheelPage
    // does it. The effect above is still the only release path: `finally`
    // clears buyingCount, which flips hasUnrevealed back to false for a
    // purchase that produced no cards and releases the hold then.
    if (balanceKnown && !holdingRef.current) {
      holdingRef.current = true;
      holdForReveal();
    }
    try {
      const out = await buy(count);
      if (!out) return;
      // Keep any still-unrevealed cards from the prior batch and append the new
      // ones, so a second purchase before the user finishes scratching does not
      // discard their earlier cards (reported). A fully-revealed prior batch is
      // dropped here (its unrevealed filter is empty), starting fresh.
      setResults((prev) => [...prev.filter((_, i) => !revealed.has(i)), ...out]);
      setRevealed(new Set());
      celebratedBatchRef.current = null;
      showToast(`${out.length} card${out.length === 1 ? "" : "s"} purchased — tap to reveal`, "info");
      invalidateHistory();
    } finally {
      setBuyingCount(null);
    }
  }, [buy, showToast, invalidateHistory, revealed, balanceKnown, holdForReveal]);

  useEffect(() => {
    if (results.length === 0) return;
    if (revealed.size !== results.length) return;

    const batchKey = results.map((r) => `${r.cardId}:${r.bulkIndex}`).join(",");
    if (celebratedBatchRef.current === batchKey) return;
    celebratedBatchRef.current = batchKey;

    // Reveal-complete: now safe to sync the displayed wallet balance with
    // the on-chain post-payout state. Purchase intentionally deferred this.
    refreshBalance();

    const totalPrize = results.reduce((s, r) => s + r.prizeAmount, 0n);
    const wins = results.filter((r) => r.multiplier > 0).length;
    const spent = BigInt(results.length) * BigInt(CARD_PRICE_NUSDC) * NUSDC_UNIT;
    const isProfit = totalPrize > spent;

    if (isProfit) {
      const whole = (totalPrize - spent) / NUSDC_UNIT;
      const frac = Number((totalPrize - spent) % NUSDC_UNIT) / NUSDC_UNIT_NUMBER;
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
  }, [revealed, results, celebrate, showToast, refreshBalance]);

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
