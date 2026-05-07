import { formatNusdc } from "../../../lib/format";
import type { ClaimableTicket } from "../hooks";

const URGENT_DEADLINE_MS = 24 * 60 * 60 * 1000;

export function ClaimBanner({
  claimable,
  totalNusdc,
  earliestDeadlineMs,
  onClaim,
  isClaiming,
  claimingTicketId,
}: {
  claimable: ClaimableTicket[];
  totalNusdc: bigint;
  earliestDeadlineMs: number | null;
  onClaim: (roundId: string, ticketId: string) => void;
  isClaiming: boolean;
  claimingTicketId?: string | null;
}) {
  if (claimable.length === 0) return null;

  const now = Date.now();
  const isUrgent = earliestDeadlineMs != null && earliestDeadlineMs - now < URGENT_DEADLINE_MS;
  const deadlineDate = earliestDeadlineMs
    ? new Date(earliestDeadlineMs).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "";

  const sorted = [...claimable].sort((a, b) => a.deadlineMs - b.deadlineMs);
  const tone = isUrgent ? "border-amber-500/60 bg-amber-950/40" : "border-emerald-500/40 bg-emerald-950/30";

  return (
    <section className={`panel p-5 ${tone}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className={`font-display text-2xl ${isUrgent ? "text-amber-200" : "text-emerald-300"}`}>
            {isUrgent ? "Claim deadline approaching" : "You have unclaimed prizes"}
          </h2>
          <p className="text-base text-neutral-200 mt-1">
            {claimable.length} winning ticket{claimable.length === 1 ? "" : "s"} ·{" "}
            <span className="font-mono text-gold-200">{formatNusdc(totalNusdc)} NUSDC</span>
          </p>
        </div>
        <p className={`text-sm ${isUrgent ? "text-amber-200" : "text-neutral-200"}`}>
          Earliest deadline · <span className="font-mono">{deadlineDate}</span>
        </p>
      </div>

      <ul className="space-y-2">
        {sorted.map((c) => {
          const tierLabel = c.tier === 1 ? "Jackpot" : c.tier === 2 ? "2nd" : "3rd";
          const ticketUrgent = c.msUntilDeadline < URGENT_DEADLINE_MS;
          return (
            <li
              key={c.ticket.id}
              className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-gold-subtle/40 bg-ink-900/60"
            >
              <span className="font-mono text-sm text-neutral-200 w-20">Round {c.round.roundNumber}</span>
              <span className="text-sm text-gold-200 font-semibold">{tierLabel}</span>
              <span className="font-mono text-sm text-gold-200">{formatNusdc(c.payout)} NUSDC</span>
              <div className="flex gap-1">
                {c.ticket.numbers.map((n) => {
                  const hit = c.round.drawnNumbers?.includes(n) ?? false;
                  return (
                    <span key={n} className={`number-ball !w-7 !h-7 !text-sm ${hit ? "is-selected" : ""}`}>
                      {n}
                    </span>
                  );
                })}
              </div>
              <span className={`ml-auto text-sm ${ticketUrgent ? "text-amber-200 font-semibold" : "text-neutral-200"}`}>
                {fmtTimeLeft(c.msUntilDeadline)}
              </span>
              <button
                onClick={() => onClaim(c.round.id, c.ticket.id)}
                disabled={isClaiming}
                className="btn-gold !py-2 !px-4 text-sm"
              >
                {claimingTicketId === c.ticket.id
                  ? "Claiming..."
                  : isClaiming
                    ? "Claim"
                    : "Claim"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ExpiredBanner({ expired }: { expired: ClaimableTicket[] }) {
  if (expired.length === 0) return null;
  const total = expired.reduce((s, c) => s + c.payout, 0n);
  return (
    <section className="panel p-4 border-neutral-700/60 bg-ink-900/60">
      <h2 className="font-display text-lg text-neutral-200 mb-2">Forfeited prizes</h2>
      <p className="text-sm text-neutral-200">
        {expired.length} winning ticket{expired.length === 1 ? "" : "s"} past the 30-day claim window (
        {formatNusdc(total)} NUSDC). These have been swept to the bankroll. Burn the tickets below to clear them from
        your wallet.
      </p>
    </section>
  );
}

function fmtTimeLeft(ms: number): string {
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) {
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    return `${hours}h ${mins}m left`;
  }
  const mins = Math.floor(ms / 60_000);
  return `${mins}m left`;
}
