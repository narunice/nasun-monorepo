import { MINES_GRID_SIZE, MINES_MAX_SINGLE_PAYOUT } from "../../../lib/gostop-config";
import { computeMultiplierBps } from "../mines-config";
import type { MinesSession } from "../mines-client";
import { formatNusdcFixed } from "../../../lib/format";
import { Spinner } from "../../../components/shared/GameUI";

export function MinesActiveSession({
  session,
  pendingCells,
  phase,
  onReveal,
  onCashout,
  onForfeit,
}: {
  session: MinesSession;
  pendingCells: Set<number>;
  phase: "idle" | "creating" | "cashing_out" | "forfeiting" | "busy";
  onReveal: (i: number) => void;
  onCashout: () => void;
  onForfeit: () => void;
}) {
  const rawMul = computeMultiplierBps(session.mineCount, session.safeReveals) / 10_000;
  const rawPayout = (session.betAmount * BigInt(Math.floor(rawMul * 10_000))) / 10_000n;
  const currentPayout = rawPayout > MINES_MAX_SINGLE_PAYOUT ? MINES_MAX_SINGLE_PAYOUT : rawPayout;
  const isCapped = rawPayout > MINES_MAX_SINGLE_PAYOUT;
  // When capped, the theoretical multiplier overstates the actual win.
  // Show the effective multiplier (payout / bet) so users do not think
  // their position keeps growing past the per-game payout limit.
  const effectiveMul = session.betAmount > 0n
    ? Number((currentPayout * 10_000n) / session.betAmount) / 10_000
    : rawMul;
  const currentMul = isCapped ? effectiveMul : rawMul;
  const rawNextMul = computeMultiplierBps(session.mineCount, session.safeReveals + 1) / 10_000;
  const nextMul = isCapped ? effectiveMul : rawNextMul;
  const canCashout = session.safeReveals > 0 && phase === "idle" && pendingCells.size === 0;
  const canForfeit = phase === "idle" && pendingCells.size === 0;

  return (
    <section className="panel p-5 sm:p-7 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatBox label="Bet" value={`${formatNusdcFixed(session.betAmount)} NUSDC`} />
        <StatBox label="Current" value={isCapped ? `${currentMul.toFixed(2)}× (max)` : `${currentMul.toFixed(2)}×`} emphasis />
        <StatBox label="Next reveal" value={isCapped ? "Capped" : `${nextMul.toFixed(2)}×`} />
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-3 max-w-md mx-auto">
        {Array.from({ length: MINES_GRID_SIZE }, (_, i) => {
          const revealed = session.revealed[i];
          const pending = pendingCells.has(i);
          const disabled = revealed || pending || phase !== "idle";
          return (
            <button
              key={i}
              onClick={() => onReveal(i)}
              disabled={disabled}
              className={`aspect-square rounded-lg flex items-center justify-center transition-all ${
                revealed
                  ? "border-2 border-emerald-500/60 bg-emerald-950/40 text-emerald-300"
                  : pending
                    ? "border border-gold-200/60 bg-ink-900 animate-pulse"
                    : "border border-gold-subtle bg-ink-900 hover:border-gold-200/60 hover:-translate-y-0.5"
              } ${disabled && !revealed && !pending ? "opacity-50" : ""}`}
            >
              {revealed ? <span className="text-lg">✓</span> : <span className="text-sm text-neutral-400">{i + 1}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-col items-center gap-3">
        <p className="text-sm text-neutral-200">
          Safe reveals: <span className="font-mono text-gold-200">{session.safeReveals}</span>
          {" / "}
          {MINES_GRID_SIZE - session.mineCount}
        </p>
        {isCapped && <p className="text-sm text-amber-300">Payout reached the cap. Further reveals do not increase your win.</p>}
        <button
          onClick={onCashout}
          disabled={!canCashout}
          className="btn-gold w-full sm:w-auto sm:min-w-[20rem] !px-10 !py-4 text-xl font-bold tracking-wide shadow-gold-glow disabled:shadow-none inline-flex items-center justify-center gap-2"
        >
          {phase === "cashing_out" && <Spinner className="h-5 w-5" />}
          {phase === "cashing_out"
            ? "Cashing out…"
            : session.safeReveals === 0
              ? "Reveal a cell first"
              : `Cash Out · ${formatNusdcFixed(currentPayout)} NUSDC`}
        </button>

        <button
          onClick={() => {
            if (window.confirm('Forfeit this session? Your bet will be lost. Use this only if the game appears stuck.')) {
              onForfeit();
            }
          }}
          disabled={!canForfeit}
          className="btn-ghost !py-2 !px-4 text-xs text-neutral-300 hover:text-neutral-100 disabled:opacity-50"
        >
          {phase === "forfeiting" ? "Forfeiting…" : "Forfeit session"}
        </button>
      </div>
    </section>
  );
}

function StatBox({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="p-4 rounded-lg border border-gold-subtle/40 bg-ink-900/60">
      <p className="text-sm text-neutral-200 uppercase tracking-wider">{label}</p>
      <p className={`font-mono mt-1 ${emphasis ? "text-2xl text-gold-200" : "text-xl text-neutral-100"}`}>{value}</p>
    </div>
  );
}
