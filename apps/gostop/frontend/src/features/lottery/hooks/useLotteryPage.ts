import { useEffect, useState, useCallback } from "react";
import { useClaimSummary, useLatestRound, useMyTickets } from "../hooks";
import { ROUND_STATUS } from "../../../lib/gostop-config";
import { nextMondayUtc } from "../lottery-utils";
import { useLotteryActions } from "../useLotteryActions";
import { tierForLottery } from "../../../components/celebration";
import { useInvalidateGameHistory } from "../../game-history";

const PICK_COUNT = 5;

export function useLotteryPage(celebrate: any) {
  const [picks, setPicks] = useState<number[]>([]);
  const [quickPickSeed, setQuickPickSeed] = useState(0);
  const [fallbackCloseAt, setFallbackCloseAt] = useState<Date>(() => nextMondayUtc());
  const { round, loading: roundLoading, refresh: refreshRound } = useLatestRound();

  useEffect(() => {
    const id = setInterval(() => setFallbackCloseAt(nextMondayUtc()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const {
    walletAddress,
    isWalletConnected,
    buyTicket,
    buyTicketBulk,
    claimPrize,
    burnTicket,
    isBuying,
    isClaiming,
    claimingTicketId,
    burningTicketId,
    error,
    clearError,
  } = useLotteryActions();

  const { tickets, refresh: refreshTickets } = useMyTickets(walletAddress, round?.id);
  const claimSummary = useClaimSummary(walletAddress);
  const invalidateHistory = useInvalidateGameHistory();

  const closeMs = round?.closeTime ?? fallbackCloseAt.getTime();
  const isRoundOpen = round?.status === ROUND_STATUS.OPEN && Date.now() < round.closeTime;

  const togglePick = useCallback((n: number) => {
    setPicks((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : prev.length < PICK_COUNT ? [...prev, n].sort((a, b) => a - b) : prev,
    );
  }, []);

  const quickPick = useCallback(() => {
    const pool = Array.from({ length: 25 }, (_, i) => i + 1);
    const picked: number[] = [];
    while (picked.length < PICK_COUNT) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    setPicks(picked.sort((a, b) => a - b));
    setQuickPickSeed((s) => s + 1);
  }, []);

  const [purchaseConfirm, setPurchaseConfirm] = useState<{
    count: number;
    picks: number[] | null;
    roundNumber: number | null;
  } | null>(null);

  const onBuy = useCallback(async () => {
    if (!round || picks.length !== PICK_COUNT) return;
    const submitted = [...picks];
    const ok = await buyTicket(round.id, picks);
    if (ok) {
      setPicks([]);
      refreshRound();
      refreshTickets();
      invalidateHistory();
      setPurchaseConfirm({
        count: 1,
        picks: submitted,
        roundNumber: round.roundNumber ?? null,
      });
      setTimeout(refreshTickets, 2_000);
    }
  }, [round, picks, buyTicket, refreshRound, refreshTickets, invalidateHistory]);

  const onQuickBuy = useCallback(async (count: number) => {
    if (!round) return;
    const ok = await buyTicketBulk(round.id, count);
    if (ok) {
      refreshRound();
      refreshTickets();
      invalidateHistory();
      setPurchaseConfirm({
        count,
        picks: null,
        roundNumber: round.roundNumber ?? null,
      });
      setTimeout(refreshTickets, 2_000);
    }
  }, [round, buyTicketBulk, refreshRound, refreshTickets, invalidateHistory]);

  const onClaim = useCallback(async (roundId: string, ticketId: string) => {
    const claimable = claimSummary.claimable.find((c) => c.round.id === roundId && c.ticket.id === ticketId);
    const ok = await claimPrize(roundId, ticketId);
    if (ok) {
      refreshRound();
      refreshTickets();
      invalidateHistory();
      if (claimable) {
        celebrate({
          variant: "tiered",
          tier: tierForLottery(claimable.tier),
          payout: claimable.payout,
          gameLabel: "Lottery",
          tierLabelOverride: claimable.tier === 1 ? "JACKPOT" : claimable.tier === 2 ? "2ND PRIZE" : "3RD PRIZE",
        });
      }
    }
  }, [claimSummary.claimable, claimPrize, refreshRound, refreshTickets, invalidateHistory, celebrate]);

  const onBurn = useCallback(async (roundId: string, ticketId: string) => {
    const ok = await burnTicket(roundId, ticketId);
    if (ok) refreshTickets();
  }, [burnTicket, refreshTickets]);

  const canBuy = picks.length === PICK_COUNT && isWalletConnected && isRoundOpen && !isBuying;

  return {
    picks,
    setPicks,
    quickPickSeed,
    round,
    roundLoading,
    closeMs,
    isRoundOpen,
    walletAddress,
    isWalletConnected,
    tickets,
    claimSummary,
    error,
    clearError,
    isBuying,
    isClaiming,
    claimingTicketId,
    burningTicketId,
    togglePick,
    quickPick,
    onBuy,
    onQuickBuy,
    onClaim,
    onBurn,
    canBuy,
    purchaseConfirm,
    setPurchaseConfirm,
  };
}
