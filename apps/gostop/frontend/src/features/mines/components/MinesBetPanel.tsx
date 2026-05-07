import { BetSlider } from "../../../components/shared/GameUI";
import {
  MINES_GRID_SIZE,
  MINES_MIN_MINES,
  MINES_MAX_MINES,
} from "../../../lib/gostop-config";
import { computeMultiplierBps } from "../mines-config";

const MIN_BET_NUSDC = 0.1;

export function MinesBetPanel({
  bet,
  mineCount,
  maxBetAllowed,
  maxMul,
  payoutCapNusdc,
  isWalletConnected,
  isCreating,
  onBetChange,
  onMineCountChange,
  onCreate,
}: {
  bet: number;
  mineCount: number;
  maxBetAllowed: number;
  maxMul: number;
  payoutCapNusdc: number;
  isWalletConnected: boolean;
  isCreating: boolean;
  onBetChange: (n: number) => void;
  onMineCountChange: (n: number) => void;
  onCreate: () => void;
}) {
  const overCap = bet > maxBetAllowed;
  const theoreticalPayout = bet * maxMul;
  const payoutWillCap = theoreticalPayout > payoutCapNusdc;
  
  const fmtNum = (n: number) => n.toFixed(2);

  return (
    <section className="panel p-5 sm:p-7 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm text-neutral-200 mb-2">Bet (NUSDC)</label>
          <input
            type="number"
            min={MIN_BET_NUSDC}
            step={0.1}
            value={bet}
            onChange={(e) => onBetChange(Number(e.target.value) || 0)}
            className="w-full px-4 py-3 rounded-lg bg-ink-900 border border-gold-subtle text-neutral-100 font-mono focus:outline-none focus:border-gold-200/60"
          />
          <div className="mt-3">
            <BetSlider
              value={String(bet)}
              min={MIN_BET_NUSDC}
              max={maxBetAllowed}
              onChange={(v) => onBetChange(Number(v))}
            />
          </div>
          <p className="text-sm text-neutral-200 mt-2">Max bet: {fmtNum(maxBetAllowed)} NUSDC</p>
        </div>
        <div>
          <label className="block text-sm text-neutral-200 mb-2">
            Mines ({MINES_MIN_MINES}-{MINES_MAX_MINES})
          </label>
          <input
            type="range"
            min={MINES_MIN_MINES}
            max={MINES_MAX_MINES}
            value={mineCount}
            onChange={(e) => onMineCountChange(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-sm text-gold-200 mt-1 font-mono">
            {mineCount} / {MINES_GRID_SIZE - 1}
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border border-gold-subtle/50 bg-ink-900/60">
        <div>
          <p className="text-sm text-neutral-200">First reveal multiplier</p>
          <p className="font-mono text-xl text-gold-200">
            {(computeMultiplierBps(mineCount, 1) / 10_000).toFixed(2)}×
          </p>
        </div>
        <div>
          <p className="text-sm text-neutral-200">Max (all safe cells)</p>
          <p className="font-mono text-xl text-gold-200">{maxMul.toFixed(2)}×</p>
        </div>
        <div>
          <p className="text-sm text-neutral-200">Max payout</p>
          <p className="font-mono text-xl text-gold-200">
            {fmtNum(Math.min(theoreticalPayout, payoutCapNusdc))} NUSDC
          </p>
        </div>
      </div>
      {overCap && (
        <p className="text-sm text-amber-300">Bet will be capped to {fmtNum(maxBetAllowed)} NUSDC (per-payout limit).</p>
      )}
      {payoutWillCap && !overCap && (
        <p className="text-sm text-amber-300">
          Payout is capped at {fmtNum(payoutCapNusdc)} NUSDC. Reveals beyond the cap multiplier do not increase your win.
        </p>
      )}
      <button
        onClick={onCreate}
        disabled={!isWalletConnected || isCreating || bet < MIN_BET_NUSDC}
        className="btn-gold w-full md:w-auto"
      >
        {isCreating
          ? "Starting…"
          : !isWalletConnected
            ? "Connect Wallet"
            : `Start Session · ${fmtNum(Math.min(bet, maxBetAllowed))} NUSDC`}
      </button>
    </section>
  );
}
