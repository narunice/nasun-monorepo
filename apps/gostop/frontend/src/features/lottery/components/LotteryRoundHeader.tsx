import { useEffect, useState } from "react";
import lotteryThumb from "../../../assets/images/lottery.webp";
import { fmtDiff } from "../lottery-utils";

interface RoundHeaderProps {
  closeMs: number;
  roundNumber: number | null;
  statusText: string;
  prizePoolNusdc: string;
}

/**
 * Countdown isolated into its own component so the 1Hz tick only re-renders
 * the timer text, not the whole page.
 */
function Countdown({ closeMs }: { closeMs: number }) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <p className="font-mono text-3xl text-gold-200 tabular-nums">{fmtDiff(closeMs - now)}</p>;
}

export function LotteryRoundHeader({
  closeMs,
  roundNumber,
  statusText,
  prizePoolNusdc,
}: RoundHeaderProps) {
  const roundLabel = roundNumber != null ? `Round ${String(roundNumber).padStart(3, "0")}` : "Round -";
  return (
    <header className="panel p-6 md:p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)]">
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        <img
          src={lotteryThumb}
          alt=""
          aria-hidden
          className="w-full md:w-48 h-40 md:h-48 rounded-xl object-cover border border-gold-subtle shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">
            {roundLabel} · {statusText}
          </p>
          <h1 className="font-display text-4xl md:text-5xl text-gold">The Weekly</h1>
          <p className="text-base text-neutral-200 mt-3 max-w-md leading-relaxed">
            Pick five numbers from 1 to 25. Draw every Monday 00:00 UTC. 70% to winners, 20% rolls over, 10% flows to the
            bankroll.
          </p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-sm uppercase tracking-[0.25em] text-neutral-200 mb-2">Closes in</p>
          <Countdown closeMs={closeMs} />
          <p className="text-sm text-neutral-200 mt-3">
            Prize Pool · <span className="text-gold-200 font-mono text-base">{prizePoolNusdc} NUSDC</span>
          </p>
        </div>
      </div>
    </header>
  );
}
