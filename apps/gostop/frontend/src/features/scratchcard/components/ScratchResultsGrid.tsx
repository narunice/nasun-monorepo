import { ScratchSurface } from "../ScratchSurface";
import type { ScratchResult } from "../useScratchCard";
import { formatNusdcFixed } from "../../../lib/format";

export function ScratchResultsGrid({
  results,
  revealed,
  totalWinnings,
  onRevealAll,
  onRevealOne,
}: {
  results: ScratchResult[];
  revealed: Set<number>;
  totalWinnings: bigint;
  onRevealAll: () => void;
  onRevealOne: (i: number) => void;
}) {
  const allRevealed = results.length > 0 && revealed.size === results.length;

  return (
    <section className="panel p-5 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-2xl text-gold">Results</h2>
          <p className="text-sm text-neutral-200 mt-1">
            {revealed.size} / {results.length} revealed ·{" "}
            <span className="font-mono text-gold-200">{formatNusdcFixed(totalWinnings)} NUSDC</span>
          </p>
        </div>
        {!allRevealed && (
          <button onClick={onRevealAll} className="btn-gold !py-2 !px-5 text-sm">
            Reveal all
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {results.map((r, i) => (
          <Card key={`${r.cardId}-${i}`} result={r} revealed={revealed.has(i)} onReveal={() => onRevealOne(i)} />
        ))}
      </div>
    </section>
  );
}

function Card({ result, revealed, onReveal }: { result: ScratchResult; revealed: boolean; onReveal: () => void }) {
  const isWin = result.multiplier > 0;
  return (
    <div
      className={`relative aspect-[3/4] rounded-lg border overflow-hidden ${
        revealed
          ? isWin
            ? "border-gold-200/60 bg-gradient-to-br from-amber-950/80 to-ink-900 shadow-[0_0_20px_-5px_rgba(212,175,55,0.4)] animate-slide-in"
            : "border-neutral-700 bg-ink-900/80 animate-slide-in"
          : "border-gold-subtle bg-gradient-to-br from-ink-800 to-ink-900"
      }`}
    >
      <ScratchSurface revealed={revealed} onReveal={onReveal}>
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-3">
          {isWin ? (
            <>
              <span className="font-display text-3xl text-gold">{result.multiplier}×</span>
              <span className="font-mono text-sm text-gold-200">+{formatNusdcFixed(result.prizeAmount)}</span>
              <span className="text-xs text-neutral-200 uppercase tracking-wider">Won</span>
            </>
          ) : (
            <>
              <span className="font-display text-2xl text-neutral-400">—</span>
              <span className="text-xs text-neutral-500 uppercase tracking-wider">No win</span>
            </>
          )}
        </div>
      </ScratchSurface>
    </div>
  );
}
