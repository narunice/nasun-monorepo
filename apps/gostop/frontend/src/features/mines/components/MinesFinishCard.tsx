import { formatNusdcFixed } from "../../../lib/format";
import type { useMines } from "../useMines";

type MinesFinish = NonNullable<ReturnType<typeof useMines>["lastFinish"]>;

export function MinesFinishCard({ finish, onDismiss }: { finish: MinesFinish; onDismiss: () => void }) {
  const won = finish.kind === "cashed_out";
  return (
    <section
      className={`panel p-10 text-center animate-slide-in ${
        won ? "border-gold-200/60 bg-gradient-to-br from-amber-950/50 to-ink-900" : "border-red-500/50 bg-gradient-to-br from-red-950/40 to-ink-900"
      }`}
    >
      <p className="text-sm uppercase tracking-wider text-neutral-200">{won ? "Session cashed out" : "Mine hit"}</p>
      <h2 className={`font-display text-5xl mt-2 ${won ? "text-gold" : "text-red-300"}`}>{won ? `+${formatNusdcFixed(finish.payout)} NUSDC` : "💥"}</h2>
      <p className="text-base text-neutral-200 mt-2 font-mono">
        Bet {formatNusdcFixed(finish.bet)} · {won ? "Payout" : "Lost"} {won ? formatNusdcFixed(finish.payout) : formatNusdcFixed(finish.bet)} NUSDC
      </p>
      <button onClick={onDismiss} className="btn-gold mt-6">
        Play again
      </button>
    </section>
  );
}
