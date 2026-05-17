import { useEffect, useMemo, useState } from "react";
import { countMatchingNumbers, getTicketTier } from "../lottery-client";
import { formatNusdc } from "../../../lib/format";
import { ROUND_STATUS } from "../../../lib/gostop-config";
import type { Ticket, LotteryRound } from "../lottery-client";

const TICKETS_PER_PAGE = 10;

export function PurchaseConfirmModal({
  count,
  picks,
  roundNumber,
  totalCostNusdc,
  onClose,
}: {
  count: number;
  picks: number[] | null;
  roundNumber: number | null;
  totalCostNusdc: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roundLabel = roundNumber != null ? `Round ${String(roundNumber).padStart(3, "0")}` : "this round";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-5 bg-ink-950/65 backdrop-blur-sm animate-slide-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md panel p-6 sm:p-8 text-center bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_60%)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-full border border-gold-200/60 bg-gold-200/10 flex items-center justify-center text-3xl text-gold-200">
          ✓
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-300 mb-2">Purchase Confirmed</p>
        <h2 className="font-display text-3xl text-gold mb-3">{count === 1 ? "1 Ticket" : `${count} Tickets`} Bought</h2>
        <p className="text-base text-neutral-200 leading-relaxed mb-5">
          Entered into <span className="text-gold-200">{roundLabel}</span> for{" "}
          <span className="font-mono text-gold-200">{totalCostNusdc} NUSDC</span>.
        </p>
        {picks && picks.length > 0 && (
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.25em] text-neutral-300 mb-3">Your Numbers</p>
            <div className="flex justify-center gap-2 flex-wrap">
              {picks.map((n) => (
                <span
                  key={n}
                  className="w-10 h-10 rounded-full border border-gold-subtle bg-ink-900 flex items-center justify-center font-display text-lg text-gold-200"
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="text-sm text-neutral-300 italic mb-6">Good luck. Draw happens Monday 00:00 UTC.</p>
        <button onClick={onClose} className="btn-gold w-full !py-3 text-base">
          Got it
        </button>
      </div>
    </div>
  );
}

export function MyTickets({
  tickets,
  round,
  onClaim,
  onBurn,
  isClaiming,
  claimingTicketId,
  burningTicketId,
  isWalletConnected,
}: {
  tickets: Ticket[];
  round: LotteryRound | null;
  onClaim: (roundId: string, ticketId: string) => void;
  onBurn: (roundId: string, ticketId: string) => void;
  isClaiming: boolean;
  claimingTicketId?: string | null;
  burningTicketId?: string | null;
  isWalletConnected: boolean;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(tickets.length / TICKETS_PER_PAGE));
  // Clamp current page when the list shrinks (e.g. after burn/claim).
  const safePage = Math.min(page, totalPages);
  const pageTickets = useMemo(
    () => tickets.slice((safePage - 1) * TICKETS_PER_PAGE, safePage * TICKETS_PER_PAGE),
    [tickets, safePage],
  );
  // Sync state when clamped.
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  if (!isWalletConnected) {
    return (
      <section className="panel p-7">
        <h2 className="font-display text-2xl text-gold mb-3">My Tickets</h2>
        <p className="text-base text-neutral-200 italic">Connect a wallet to see tickets owned by your address.</p>
      </section>
    );
  }
  if (tickets.length === 0) {
    return (
      <section className="panel p-7">
        <h2 className="font-display text-2xl text-gold mb-3">My Tickets</h2>
        <p className="text-base text-neutral-200 italic">Tickets you buy this round will appear here.</p>
      </section>
    );
  }
  const showPager = tickets.length > TICKETS_PER_PAGE;
  return (
    <section className="panel p-7">
      <div className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
        <h2 className="font-display text-2xl text-gold">My Tickets</h2>
        <span className="text-sm text-neutral-300">
          {tickets.length} total
          {showPager && (
            <>
              {" · showing "}
              {(safePage - 1) * TICKETS_PER_PAGE + 1}–
              {Math.min(safePage * TICKETS_PER_PAGE, tickets.length)}
            </>
          )}
        </span>
      </div>
      <ul className="space-y-3">
        {pageTickets.map((t) => {
          const matches = round ? countMatchingNumbers(t.numbers, round.drawnNumbers) : 0;
          const tier = getTicketTier(matches);
          const settled = round?.status === ROUND_STATUS.SETTLED && round.id === t.roundId;
          const tierLabel = tier === 1 ? "Jackpot" : tier === 2 ? "2nd" : tier === 3 ? "3rd" : null;
          const payout =
            tier === 1
              ? round?.tier1PayoutPerWinner
              : tier === 2
                ? round?.tier2PayoutPerWinner
                : tier === 3
                  ? round?.tier3PayoutPerWinner
                  : 0n;
          return (
            <li
              key={t.id}
              className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-lg border border-gold-subtle bg-ink-900/60"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-neutral-200 w-16 shrink-0">#{t.ticketId}</span>
                <div className="flex gap-2 flex-wrap">
                  {t.numbers.map((n) => {
                    const hit = round?.drawnNumbers?.includes(n) ?? false;
                    return (
                      <span key={n} className={`number-ball !w-9 !h-9 !text-base ${hit ? "is-selected" : ""}`}>
                        {n}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between md:ml-auto gap-3">
                {settled && tierLabel && (
                  <span className="font-mono text-sm text-gold-200">
                    {tierLabel} · {formatNusdc(payout ?? 0n)} NUSDC
                  </span>
                )}
                {!settled && <span className="font-mono text-sm text-gold-200">5.00 NUSDC</span>}
                {settled && tier !== 0 && (() => {
                  const isThisClaiming = claimingTicketId === t.id;
                  const otherInFlight = isClaiming && !isThisClaiming;
                  return (
                    <button
                      onClick={() => onClaim(t.roundId, t.id)}
                      disabled={isClaiming}
                      className="btn-gold !py-2 !px-4 text-sm shrink-0 disabled:opacity-60"
                      title={otherInFlight ? "Another claim in progress" : undefined}
                    >
                      {isThisClaiming ? "Claiming..." : "Claim"}
                    </button>
                  );
                })()}
                {settled && tier === 0 && (() => {
                  const isThisBurning = burningTicketId === t.id;
                  return (
                    <button
                      onClick={() => onBurn(t.roundId, t.id)}
                      disabled={isThisBurning}
                      className="btn-ghost !py-2 !px-4 text-sm shrink-0 disabled:opacity-60"
                      title="Remove non-winning ticket from your wallet"
                    >
                      {isThisBurning ? "Burning..." : "Burn"}
                    </button>
                  );
                })()}
              </div>
            </li>
          );
        })}
      </ul>
      {showPager && (
        <nav
          role="navigation"
          aria-label="Tickets pagination"
          className="mt-5 flex items-center justify-center gap-2"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="btn-ghost !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="font-mono text-sm text-neutral-200 min-w-[80px] text-center">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="btn-ghost !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </nav>
      )}
    </section>
  );
}
