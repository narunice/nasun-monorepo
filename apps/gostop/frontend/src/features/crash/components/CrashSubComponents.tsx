import { useEffect, useRef, useState } from "react";
import { formatMultiplier } from "../crash-math";
import { formatNusdc } from "../../../lib/format";
import { CRASH_MIN_BET, CRASH_MAX_BET } from "../../../lib/gostop-config";
import { Spinner, BetSlider } from "../../../components/shared/GameUI";

const CHAIN_CONFIRMATION_BUFFER_MS = 2500;

export function NextRoundIndicator({
  nextRoundAt,
  now,
  large,
}: {
  nextRoundAt: number | null;
  now: number;
  large?: boolean;
}) {
  const target = nextRoundAt !== null ? nextRoundAt + CHAIN_CONFIRMATION_BUFFER_MS : null;
  const secsLeft = target !== null ? Math.max(0, Math.ceil((target - now) / 1000)) : null;
  const counting = secsLeft !== null && secsLeft > 0;
  const sizeText = large ? "text-2xl" : "text-sm";
  return (
    <span className={`inline-flex items-center justify-center ${sizeText} text-gray-400`}>
      {counting ? `Next round in ${secsLeft}s` : "Confirming on chain..."}
    </span>
  );
}

export function WaitingPanel({
  label,
  targetAt,
  now,
  betAmount,
  isNextRound,
}: {
  label: string;
  targetAt: number | null;
  now: number;
  betAmount: bigint;
  isNextRound?: boolean;
}) {
  const target = targetAt !== null && isNextRound ? targetAt + CHAIN_CONFIRMATION_BUFFER_MS : targetAt;
  const secsLeft = target !== null ? Math.max(0, Math.ceil((target - now) / 1000)) : null;
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4 text-gray-300">
      <Spinner className="h-6 w-6 text-gold-300" />
      <p className="text-base">{secsLeft === 0 && isNextRound ? "Confirming on chain..." : label}</p>
      {secsLeft !== null && secsLeft > 0 && <p className="font-mono text-lg text-gold-200">{secsLeft}s</p>}
      {betAmount > 0n && (
        <p className="text-sm text-gray-400">
          Your bet: <span className="font-mono text-gold-200">{formatNusdc(betAmount)} NUSDC</span>
        </p>
      )}
    </div>
  );
}

export { BetSlider }; // Temporarily keeping the export for compatibility, will clean up later if needed.
// Actually, I should just map the props and use the shared one in ActionPanel.

export function FeaturePreviewTag() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  return (
    <div ref={wrapRef} className="mt-3 relative inline-flex items-center gap-1.5">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs uppercase tracking-[0.15em] border border-amber-400/40 bg-amber-950/30 text-amber-300/90">
        Experimental
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 inline-flex items-center justify-center rounded-full border border-amber-400/40 text-amber-300/90 text-[11px] font-semibold leading-none hover:border-amber-300 hover:text-amber-200 transition"
      >
        i
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-20 w-64 panel p-3 text-sm leading-relaxed text-neutral-200 shadow-xl">
          Crash is still in active testing. You may run into rough edges, and we appreciate your patience while we polish things up.
        </div>
      )}
    </div>
  );
}

export function CrashRecentHistory({
  recentRounds,
}: {
  recentRounds: Array<{ roundId: number; crashPointBps: number }>;
}) {
  if (recentRounds.length === 0) return null;
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h2 className="text-gray-400 text-sm mb-3 font-semibold">Recent Rounds</h2>
      <div className="flex flex-wrap gap-2">
        {recentRounds.map((r) => {
          const isHigh = r.crashPointBps >= 20_000;
          const isMid = r.crashPointBps >= 15_000;
          const bg = isHigh ? "bg-green-700" : isMid ? "bg-yellow-700" : "bg-red-800";
          return (
            <span key={r.roundId} className={`${bg} text-white text-sm px-2 py-1 rounded font-mono`}>
              {formatMultiplier(r.crashPointBps)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
