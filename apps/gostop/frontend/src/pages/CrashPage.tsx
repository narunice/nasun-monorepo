import { useEffect, useRef, useState } from "react";
import { useCrash } from "../features/crash/useCrash";
import { formatMultiplier } from "../features/crash/crash-math";
import { CRASH_MIN_BET, CRASH_MAX_BET } from "../lib/gostop-config";
import { WalletConnect } from "@nasun/wallet-ui";
import {
  useCelebrate,
  tierForCrash,
  useForceTierDebug,
} from "../components/celebration";
import { useCrashInvalidationEffect } from "../features/game-history";
import crashThumb from "../assets/images/crash.webp";

const NUSDC_DECIMALS = 1_000_000n;

function formatNusdc(raw: bigint): string {
  const whole = raw / NUSDC_DECIMALS;
  const frac = raw % NUSDC_DECIMALS;
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "") || "0"}`;
}

export default function CrashPage() {
  const crash = useCrash();
  const celebrate = useCelebrate();
  useForceTierDebug("Crash");
  // Invalidate game-history cache when a round resolves AND user had a bet —
  // covers both win (already invalidated by cashout effect below) and loss
  // (which has no other invalidation trigger).
  useCrashInvalidationEffect(crash.roundState?.state, crash.hasBetThisRound);
  const [betInput, setBetInput] = useState("5");
  const [autoInput, setAutoInput] = useState("");
  // Track our own bet amount so we can compute payout when cashout lands.
  // useCrash does not currently expose myBetAmount; tracking here is the
  // smallest non-invasive change.
  const myBetRef = useRef<bigint>(0n);
  const celebratedCashoutRef = useRef<number | null>(null);
  // Track which round we already fired a loss celebration for so the modal
  // shows once on the FLYING→CRASHED transition, not on every re-render.
  const celebratedLossRoundRef = useRef<number | null>(null);

  const state = crash.roundState?.state ?? "IDLE";
  const isBetting = state === "BETTING";
  const isFlying = state === "FLYING";
  // Lock bets shortly before the betting window closes so an in-flight tx does
  // not arrive after FLYING (which would abort with ERoundNotInBetting). Sui
  // devnet single-tx finality is typically ~500ms, so 1.5s leaves ~1s of slack
  // for sign + broadcast + checkpoint inclusion.
  const bettingEndsAt = crash.roundState?.bettingEndsAt ?? null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const bettingClosingSoon =
    bettingEndsAt !== null && bettingEndsAt - now < 1700;
  // After the betting countdown hits 0s the server still needs a moment to flip
  // the round to FLYING. Treat that gap as "armed" so the cash-out button shows
  // immediately (disabled) instead of leaving the user staring at a waiting line.
  const bettingWindowExpired =
    isBetting && bettingEndsAt !== null && now >= bettingEndsAt;
  const showCashOutPanel =
    crash.hasBetThisRound && (isFlying || bettingWindowExpired);
  const cashOutDisabled = !isFlying || crash.phase === "cashing_out";

  // Reset bet tracking on a new round.
  useEffect(() => {
    if (!crash.hasBetThisRound) {
      myBetRef.current = 0n;
      celebratedCashoutRef.current = null;
    }
  }, [crash.hasBetThisRound, crash.roundState?.roundId]);

  // Fire loss celebration when (a) round crashed without the user cashing out,
  // OR (b) the user's cash_out tx succeeded but was post-hoc invalidated by the
  // onchain resolve check (recorded_at > crash_deadline race). Both produce a
  // zero payout, so they share the loss modal.
  //
  // The phase guard absorbs the race where 'crashed' arrives while the
  // cashout tx is still in flight: defer firing until the tx settles
  // (success → myCashoutBps gates this off; failure → phase returns to idle
  // and re-runs this effect). Without it the loss modal would flash before
  // the eventual settlement of a late cashout.
  useEffect(() => {
    if (!crash.hasBetThisRound) return;
    if (myBetRef.current === 0n) return;
    const roundId = crash.roundState?.roundId ?? null;
    if (roundId === null) return;
    if (celebratedLossRoundRef.current === roundId) return;

    const cashoutInvalidated = crash.cashoutSettlement?.status === "invalid";
    const crashedWithoutCashout =
      state === "CRASHED" &&
      crash.myCashoutBps === null &&
      crash.phase !== "cashing_out";

    if (!cashoutInvalidated && !crashedWithoutCashout) return;

    celebratedLossRoundRef.current = roundId;
    celebrate({
      variant: "loss",
      tier: "loss",
      payout: 0n,
      gameLabel: "Crash",
    });
  }, [
    state,
    crash.hasBetThisRound,
    crash.myCashoutBps,
    crash.cashoutSettlement,
    crash.phase,
    crash.roundState?.roundId,
    celebrate,
  ]);

  // Fire WIN celebration only after onchain confirmation: the chat-server
  // broadcasts resolve_persisted with the player's actual payout from the
  // bankroll_pool::GameResult event. Celebrating on cash_out tx success alone
  // produced false BIG WIN modals when the cashout was later invalidated by
  // the resolve recorded_at check.
  useEffect(() => {
    const settlement = crash.cashoutSettlement;
    if (!settlement || settlement.status !== "confirmed") return;
    if (celebratedCashoutRef.current === settlement.multiplierBps) return;
    if (myBetRef.current === 0n) return;
    celebratedCashoutRef.current = settlement.multiplierBps;
    const multiplier = settlement.multiplierBps / 10_000;
    const tier = tierForCrash(multiplier, true);
    if (tier) {
      celebrate({
        variant: "tiered",
        tier,
        payout: settlement.payout,
        multiplier: Number(multiplier.toFixed(2)),
        gameLabel: "Crash",
      });
    }
  }, [crash.cashoutSettlement, celebrate]);

  function handleBet() {
    const amount = BigInt(Math.round(parseFloat(betInput) * 1_000_000));
    myBetRef.current = amount;
    crash.placeBet(amount);
  }

  const betFloat = parseFloat(betInput);
  const betAmountBig = Number.isFinite(betFloat)
    ? BigInt(Math.round(betFloat * 1_000_000))
    : 0n;
  const overMax = betAmountBig > CRASH_MAX_BET;

  function handleCashOut() {
    crash.cashOut();
  }

  function handleAutoSet() {
    const v = parseFloat(autoInput);
    if (v > 1) crash.setAutoCashOutBps(Math.round(v * 10_000));
    else crash.setAutoCashOutBps(null);
  }

  function handleAutoClear() {
    crash.setAutoCashOutBps(null);
    setAutoInput("");
  }

  const multiplierColor =
    crash.liveMultiplierBps < 15_000
      ? "text-green-400"
      : crash.liveMultiplierBps < 25_000
        ? "text-yellow-300"
        : "text-orange-400";

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto min-h-screen lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">
      <aside className="lg:sticky lg:top-20">
        <header
          className="panel bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)]
            flex items-center gap-4 sm:gap-5 p-4 sm:p-6
            lg:flex-col lg:items-stretch lg:gap-0 lg:p-0"
        >
          <img
            src={crashThumb}
            alt=""
            aria-hidden
            className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-xl object-cover border border-gold-subtle shrink-0
              lg:w-full lg:h-auto lg:aspect-square lg:rounded-none lg:border-0 lg:border-b lg:shrink"
          />
          <div className="flex-1 min-w-0 lg:p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-gold-300 mb-2">
              Live Round
            </p>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-gold">
              Crash
            </h1>
            <p className="text-sm lg:text-base text-neutral-200 mt-2 italic">
              Go or stop. One decision, one multiplier.
            </p>
            <FeaturePreviewTag />
          </div>
        </header>
      </aside>

      <div className="space-y-6 min-w-0">
        <CrashGraph
          // Treat BETTING-but-expired as FLYING for the graph: useCrash arms a
          // provisional anchor at bettingEndsAt so the rocket trajectory is
          // already animating during the gap before betting_closed arrives.
          state={
            state === "BETTING" && bettingWindowExpired ? "FLYING" : state
          }
          liveMultiplierBps={crash.liveMultiplierBps}
          crashedCrashPoint={
            state === "RESOLVED"
              ? (crash.recentRounds[0]?.crashPointBps ?? null)
              : null
          }
          hasCashedOut={crash.hasCashedOut}
          myCashoutBps={crash.myCashoutBps}
        />

        <div className="text-center">
          {state === "FLYING" || (state === "BETTING" && bettingWindowExpired) ? (
            // bettingWindowExpired covers the gap between countdown=0 and the
            // betting_closed WS event arriving (~500-1500ms). useCrash arms a
            // provisional anchor on bettingEndsAt during this window so the
            // rocket animates from 1.00x without a perceptible pause.
            <span
              className={`text-4xl sm:text-5xl font-bold ${multiplierColor}`}
            >
              {formatMultiplier(crash.liveMultiplierBps)}
            </span>
          ) : state === "CRASHED" || state === "RESOLVED" ? (
            <div className="space-y-1">
              <div
                className={`text-4xl sm:text-5xl font-bold ${
                  // If the user already cashed out (hasCashedOut), this round
                  // was a WIN for them regardless of where the rocket finally
                  // crashed. Showing the crash multiplier in red would imply a
                  // loss; switch to a neutral slate so the prominent "Cashed
                  // out at X.XXx" banner below carries the win signal.
                  crash.hasCashedOut ? "text-slate-400" : "text-red-400"
                }`}
              >
                {/* recentRounds[0] is only prepended on RESOLVED, so during
                  CRASHED it still points to the previous round. The live
                  'crashed' event carries crashPointBps and useCrash snaps
                  liveMultiplierBps to it, so this is correct for clients that
                  received the event live. Late-joining clients (state_sync
                  during CRASHED) briefly see 1.00x until RESOLVED arrives. */}
                {formatMultiplier(
                  state === "CRASHED"
                    ? crash.liveMultiplierBps
                    : (crash.recentRounds[0]?.crashPointBps ?? 10_000),
                )}
              </div>
              <NextRoundIndicator
                nextRoundAt={crash.roundState?.nextRoundAt ?? null}
                now={now}
              />
            </div>
          ) : state === "BETTING" ? (
            <span className="text-2xl text-gray-400">
              Accepting bets...{" "}
              {crash.roundState?.bettingEndsAt
                ? `${Math.max(0, Math.ceil((crash.roundState.bettingEndsAt - now) / 1000))}s`
                : ""}
            </span>
          ) : (
            <NextRoundIndicator
              nextRoundAt={crash.roundState?.nextRoundAt ?? null}
              now={now}
              large
            />
          )}
        </div>

        <div className="bg-gray-800 rounded-xl p-4 sm:p-5 space-y-4">
          {!crash.isWalletConnected ? (
            <WalletConnect />
          ) : crash.cashoutSettlement?.status === "invalid" ? (
            // cash_out tx succeeded but onchain resolve invalidated it
            // (recorded_at > crash_deadline race). Show the loss state in the
            // panel so the green "Cashed out" banner doesn't conflict with
            // the loss modal.
            <div className="text-center text-red-400 font-semibold py-4">
              Cashout invalidated by chain
            </div>
          ) : crash.hasCashedOut ? (
            // The crash multiplier above is rendered in slate (neutral) when
            // the user has cashed out, so this banner is the primary win
            // signal. Sized large + drop shadow to match the gravity of a
            // confirmed payout.
            <div className="text-center py-5 sm:py-6">
              <div className="text-xs sm:text-sm uppercase tracking-[0.2em] text-green-300/80 mb-1">
                Cashed out
              </div>
              <div className="text-4xl sm:text-5xl font-extrabold text-green-400 drop-shadow-[0_0_18px_rgba(74,222,128,0.45)]">
                {formatMultiplier(crash.myCashoutBps ?? 10_000)}
              </div>
            </div>
          ) : crash.hasBetThisRound &&
            (state === "CRASHED" || state === "RESOLVED") ? (
            // Closes the information gap when the round crashes at a very low
            // multiplier before the cashout panel renders. The loss modal
            // surfaces alongside this line; both clear when the next
            // round_started event resets hasBetThisRound.
            <div className="text-center text-red-400 font-semibold py-4">
              Crashed at{" "}
              {formatMultiplier(
                state === "CRASHED"
                  ? crash.liveMultiplierBps
                  : (crash.recentRounds[0]?.crashPointBps ?? 10_000),
              )}
            </div>
          ) : showCashOutPanel ? (
            <div className="space-y-3">
              <div className="flex justify-center">
                <button
                  onClick={handleCashOut}
                  disabled={cashOutDisabled}
                  className="w-full sm:min-w-[22rem] py-4 sm:py-5 px-6 sm:px-10 text-xl sm:text-2xl font-extrabold tracking-wide bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl shadow-[0_0_24px_rgba(234,179,8,0.45)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition"
                >
                  {crash.phase === "cashing_out"
                    ? "Cashing out..."
                    : isFlying
                      ? `Cash Out @ ${formatMultiplier(crash.liveMultiplierBps)}`
                      : "Cash Out"}
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Auto cash-out (e.g. 2.00)"
                  className="flex-1 bg-gray-700 text-white px-3 py-2 rounded text-sm"
                  value={autoInput}
                  onChange={(e) => setAutoInput(e.target.value)}
                />
                <button
                  onClick={handleAutoSet}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded"
                >
                  Set
                </button>
                {crash.autoCashOutBps && (
                  <button
                    onClick={handleAutoClear}
                    className="px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded"
                  >
                    Clear
                  </button>
                )}
              </div>
              {crash.autoCashOutBps && (
                <p className="text-xs text-gray-400 text-center">
                  Auto: {formatMultiplier(crash.autoCashOutBps)}
                </p>
              )}
            </div>
          ) : isBetting && !crash.hasBetThisRound ? (
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Bet amount (NUSDC)"
                  className="flex-1 bg-gray-700 text-white px-3 py-2 rounded"
                  value={betInput}
                  onChange={(e) => setBetInput(e.target.value)}
                />
                <span className="text-gray-400 text-sm">NUSDC</span>
              </div>
              <BetSlider value={betInput} onChange={setBetInput} />
              <div className="flex gap-2 text-xs">
                {[1, 5, 25, 100].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBetInput(String(v))}
                    className="flex-1 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 font-mono"
                  >
                    {v}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setBetInput(String(Number(CRASH_MAX_BET) / 1_000_000))
                  }
                  className="flex-1 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                >
                  Max
                </button>
              </div>
              <button
                onClick={handleBet}
                disabled={
                  crash.phase === "placing_bet" || bettingClosingSoon || overMax
                }
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {crash.phase === "placing_bet"
                  ? "Placing bet..."
                  : bettingClosingSoon
                    ? "Betting closing..."
                    : overMax
                      ? `Max ${formatNusdc(CRASH_MAX_BET)} NUSDC`
                      : "Place Bet"}
              </button>
            </div>
          ) : (
            <WaitingPanel
              label={
                crash.hasBetThisRound
                  ? "Waiting for round to start"
                  : "Next round starts soon"
              }
              targetAt={
                crash.hasBetThisRound
                  ? (crash.roundState?.bettingEndsAt ?? null)
                  : (crash.roundState?.nextRoundAt ?? null)
              }
              now={now}
              betAmount={crash.hasBetThisRound ? myBetRef.current : 0n}
              isNextRound={!crash.hasBetThisRound}
            />
          )}
          {crash.error && (
            <p className="text-red-400 text-sm text-center">{crash.error}</p>
          )}
        </div>

        <RoundHistory recentRounds={crash.recentRounds} />
      </div>
    </div>
  );
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Server's nextRoundAt = scheduled IDLE → BETTING transition time, but the
// on-chain create_round tx still needs to finalize after that. This buffer
// lets the displayed countdown roughly track the actual round-start moment.
const CHAIN_CONFIRMATION_BUFFER_MS = 2500;

function NextRoundIndicator({
  nextRoundAt,
  now,
  large,
}: {
  nextRoundAt: number | null;
  now: number;
  large?: boolean;
}) {
  const target =
    nextRoundAt !== null ? nextRoundAt + CHAIN_CONFIRMATION_BUFFER_MS : null;
  const secsLeft =
    target !== null ? Math.max(0, Math.ceil((target - now) / 1000)) : null;
  const counting = secsLeft !== null && secsLeft > 0;
  const sizeText = large ? "text-2xl" : "text-sm";
  // No spinner here: the bet/cashout panel below carries the primary spinner
  // for this idle state, so we avoid duplicate motion in the same view.
  return (
    <span
      className={`inline-flex items-center justify-center ${sizeText} text-gray-400`}
    >
      {counting ? `Next round in ${secsLeft}s` : "Confirming on chain..."}
    </span>
  );
}

function WaitingPanel({
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
  // Pad nextRoundAt so 0s lines up with actual on-chain round start.
  // bettingEndsAt is server-authoritative for the betting window so no padding.
  const target =
    targetAt !== null && isNextRound
      ? targetAt + CHAIN_CONFIRMATION_BUFFER_MS
      : targetAt;
  const secsLeft =
    target !== null ? Math.max(0, Math.ceil((target - now) / 1000)) : null;
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4 text-gray-300">
      <Spinner className="h-6 w-6 text-gold-300" />
      <p className="text-base">
        {secsLeft === 0 && isNextRound ? "Confirming on chain..." : label}
      </p>
      {secsLeft !== null && secsLeft > 0 && (
        <p className="font-mono text-lg text-gold-200">{secsLeft}s</p>
      )}
      {betAmount > 0n && (
        <p className="text-sm text-gray-400">
          Your bet:{" "}
          <span className="font-mono text-gold-200">
            {formatNusdc(betAmount)} NUSDC
          </span>
        </p>
      )}
    </div>
  );
}

function BetSlider({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const max = Number(CRASH_MAX_BET) / 1_000_000;
  const min = Number(CRASH_MIN_BET) / 1_000_000;
  // Logarithmic mapping so low bets aren't visually crushed against the left edge
  // (1→5→25→100 should feel evenly spaced for a casino bet picker).
  const toSlider = (v: number) =>
    Math.round(
      ((Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 1000,
    );
  const fromSlider = (s: number) =>
    Math.exp(Math.log(min) + (s / 1000) * (Math.log(max) - Math.log(min)));
  const num = Math.max(min, Math.min(max, parseFloat(value) || min));
  const sliderVal = toSlider(num);
  return (
    <div className="px-1">
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={sliderVal}
        onChange={(e) => {
          const raw = fromSlider(Number(e.target.value));
          // Snap to round NUSDC values so the displayed input stays clean.
          const snapped =
            raw < 10
              ? Math.round(raw)
              : raw < 100
                ? Math.round(raw / 5) * 5
                : Math.round(raw / 10) * 10;
          onChange(String(Math.max(min, Math.min(max, snapped))));
        }}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
        style={{
          background: `linear-gradient(to right, rgb(234 179 8) 0%, rgb(234 179 8) ${sliderVal / 10}%, rgb(55 65 81) ${sliderVal / 10}%, rgb(55 65 81) 100%)`,
        }}
      />
      <div className="flex justify-between text-xs text-gray-500 mt-1.5 font-mono">
        <span>{min} NUSDC</span>
        <span>{max} NUSDC</span>
      </div>
    </div>
  );
}

function FeaturePreviewTag() {
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
        aria-label="About this experimental feature"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 inline-flex items-center justify-center rounded-full border border-amber-400/40 text-amber-300/90 text-[11px] font-semibold leading-none hover:border-amber-300 hover:text-amber-200 transition"
      >
        i
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-full mt-2 z-20 w-64 panel p-3 text-sm leading-relaxed text-neutral-200 shadow-xl"
        >
          Crash is still in active testing. You may run into rough edges, and we appreciate your patience while we polish things up.
        </div>
      )}
    </div>
  );
}

function CrashGraph({
  state,
  liveMultiplierBps,
  crashedCrashPoint,
  hasCashedOut,
  myCashoutBps,
}: {
  state: string;
  liveMultiplierBps: number;
  crashedCrashPoint: number | null;
  hasCashedOut: boolean;
  myCashoutBps: number | null;
}) {
  const W = 500;
  // H bumped from 200 -> 280 so the rocket has more vertical runway,
  // especially on the wider desktop right column. Curve math derives from H
  // and W so the geometry stays consistent.
  const H = 280;
  const PAD = 20;

  const isFlying = state === "FLYING";
  const isCrashed = state === "CRASHED" || state === "RESOLVED";
  // Show explosion only when the user did NOT cash out. Successful cashout
  // gets a green ✓ at the cashout multiplier instead — see project memory:
  // visual state must reflect per-player outcome, not just round state.
  const showExplosion = isCrashed && !hasCashedOut;
  const showSafeExit = isCrashed && hasCashedOut;
  const endBps = isCrashed
    ? (crashedCrashPoint ?? liveMultiplierBps)
    : liveMultiplierBps;

  // Map multiplier to curve progress on a log scale so 1x→2x feels weighty
  // and 20x+ doesn't push the rocket off-screen. Capped at 1.0.
  function progressFor(bps: number): number {
    return Math.max(
      0,
      Math.min(1, Math.log(Math.max(1.001, bps / 10_000)) / Math.log(20)),
    );
  }
  function pointAt(frac: number): [number, number] {
    const x = PAD + frac * (W - PAD * 2);
    const y = H - PAD - frac * frac * (H - PAD * 2);
    return [x, y];
  }
  const progress = progressFor(endBps);

  // Sample the curve up to current progress so the trail grows with the rocket.
  const steps = 48;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    points.push(pointAt((i / steps) * progress));
  }
  const tip = points[points.length - 1] ?? [PAD, H - PAD];
  // Tangent at the tip for rocket rotation; quadratic dy/dx = 2*frac*(H-2*PAD)/(W-2*PAD)
  const slope = 2 * progress * ((H - 2 * PAD) / (W - 2 * PAD));
  const angleDeg = -Math.atan(slope) * (180 / Math.PI); // negative because SVG y flips

  // Cashout marker position. When the user cashes out at e.g. 1.5x, the
  // marker stays anchored at that point on the curve while the rocket
  // continues climbing — so the user sees exactly where they got out.
  const cashoutProgress = myCashoutBps !== null ? progressFor(myCashoutBps) : null;
  const cashoutTip =
    cashoutProgress !== null && cashoutProgress <= progress
      ? pointAt(cashoutProgress)
      : null;

  // Trail split: when the user cashed out, the segment up to the cashout
  // point shows in safe-exit green; the segment after (where the rocket kept
  // flying without them) dims to red. Without cashout, single-color trail.
  const SAFE_COLOR = "#4ade80"; // matches text-green-400 of the "Cashed out" banner
  const baseTrailColor = showExplosion
    ? "#ef4444"
    : isFlying || showSafeExit
      ? "#fbbf24"
      : "#6b7280";
  const trailGlow = showExplosion
    ? "#7f1d1d"
    : isFlying || showSafeExit
      ? "#f59e0b"
      : "#374151";

  const preCashoutPoints: Array<[number, number]> = [];
  let postCashoutPoints: Array<[number, number]> = [];
  if (cashoutTip && cashoutProgress !== null) {
    for (const p of points) {
      const xFrac = (p[0] - PAD) / (W - PAD * 2);
      if (xFrac <= cashoutProgress) preCashoutPoints.push(p);
      else postCashoutPoints.push(p);
    }
    // Stitch boundary so the two polylines meet without a gap.
    if (preCashoutPoints.length > 0) preCashoutPoints.push(cashoutTip);
    postCashoutPoints = [cashoutTip, ...postCashoutPoints];
  }
  const trailColor = baseTrailColor; // referenced by gradients below

  return (
    <div className="bg-gradient-to-b from-[#0b1023] via-[#0a0d1f] to-[#050816] rounded-xl overflow-hidden relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
        <defs>
          <linearGradient id="trailGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={trailGlow} stopOpacity="0" />
            <stop offset="60%" stopColor={trailColor} stopOpacity="0.7" />
            <stop offset="100%" stopColor={trailColor} stopOpacity="1" />
          </linearGradient>
          <radialGradient id="rocketGlow">
            <stop offset="0%" stopColor={trailColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={trailColor} stopOpacity="0" />
          </radialGradient>
          <filter id="blur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Background stars — purely decorative, twinkle while FLYING */}
        {STAR_FIELD.map((s, i) => (
          <circle
            key={i}
            cx={s.x * W}
            cy={s.y * H * 0.7}
            r={s.r}
            fill="#e5e7eb"
            opacity={isFlying ? s.o : s.o * 0.4}
            style={
              isFlying
                ? {
                    animation: `crash-twinkle ${1.5 + (i % 3) * 0.6}s ease-in-out ${i * 0.2}s infinite`,
                  }
                : undefined
            }
          />
        ))}

        {/* Axes */}
        <line
          x1={PAD}
          y1={PAD}
          x2={PAD}
          y2={H - PAD}
          stroke="#1f2937"
          strokeWidth="1"
        />
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          stroke="#1f2937"
          strokeWidth="1"
        />

        {/* Trail. When the user cashed out we split into two segments:
            green up to cashout, dim red after, so the curve itself
            communicates "you got out here, the rocket then crashed". */}
        {cashoutTip ? (
          <>
            {preCashoutPoints.length >= 2 && (
              <>
                <polyline
                  points={preCashoutPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={SAFE_COLOR}
                  strokeWidth="8"
                  strokeLinejoin="round"
                  opacity="0.35"
                  filter="url(#blur)"
                />
                <polyline
                  points={preCashoutPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={SAFE_COLOR}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            )}
            {postCashoutPoints.length >= 2 && (
              <>
                <polyline
                  points={postCashoutPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={showExplosion ? "#ef4444" : "#7f1d1d"}
                  strokeWidth="8"
                  strokeLinejoin="round"
                  opacity="0.25"
                  filter="url(#blur)"
                />
                <polyline
                  points={postCashoutPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={showExplosion ? "#ef4444" : "#9ca3af"}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              </>
            )}
          </>
        ) : (
          <>
            <polyline
              points={points.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke={trailColor}
              strokeWidth="8"
              strokeLinejoin="round"
              opacity="0.35"
              filter="url(#blur)"
            />
            <polyline
              points={points.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke="url(#trailGrad)"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Cashout marker — anchored at the cashout multiplier, persists
            through FLYING (alongside the rocket) and through CRASHED
            (replacing the explosion as the primary outcome cue). */}
        {cashoutTip && (
          <g transform={`translate(${cashoutTip[0]}, ${cashoutTip[1]})`}>
            <circle r="16" fill={SAFE_COLOR} opacity="0.45" filter="url(#blur)" />
            <circle r="10" fill={SAFE_COLOR} opacity="0.95" />
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="14"
              fill="#052e16"
              fontWeight="bold"
            >
              ✓
            </text>
          </g>
        )}

        {/* Rocket / explosion. Explosion fires only when the user did NOT
            cash out. If they did, the green ✓ marker above is the outcome
            cue and we either keep the rocket flying (FLYING) or drop it
            entirely (CRASHED) so the marker can stand alone. */}
        {showExplosion ? (
          <g transform={`translate(${tip[0]}, ${tip[1]})`}>
            <circle r="18" fill="#ef4444" opacity="0.5" filter="url(#blur)" />
            <circle r="10" fill="#fbbf24" opacity="0.9" />
            <text textAnchor="middle" dominantBaseline="middle" fontSize="22">
              💥
            </text>
          </g>
        ) : showSafeExit ? null : (
          <g transform={`translate(${tip[0]}, ${tip[1]}) rotate(${angleDeg})`}>
            {/* Glow */}
            <circle r="14" fill="url(#rocketGlow)" />
            {/* Flame puffs (animated via CSS) */}
            {isFlying && (
              <g className="crash-flame" transform="translate(-12, 0)">
                <circle cx="-2" cy="0" r="3.5" fill="#fbbf24" opacity="0.9" />
                <circle cx="-7" cy="-1" r="2.5" fill="#f97316" opacity="0.8" />
                <circle cx="-11" cy="1" r="1.8" fill="#ef4444" opacity="0.6" />
              </g>
            )}
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="20"
              transform="rotate(45)"
            >
              🚀
            </text>
          </g>
        )}
      </svg>
      <style>{`
        @keyframes crash-twinkle { 0%, 100% { opacity: var(--o, 0.6); } 50% { opacity: 0.15; } }
        .crash-flame { animation: crash-flame-flicker 0.12s steps(2) infinite; transform-origin: 0 0; }
        @keyframes crash-flame-flicker { 0% { transform: translate(-12px, 0) scaleX(1); } 100% { transform: translate(-12px, 0) scaleX(1.25); } }
      `}</style>
    </div>
  );
}

// Pre-computed star field — fixed seed so it doesn't reshuffle on every render.
const STAR_FIELD: Array<{ x: number; y: number; r: number; o: number }> = [
  { x: 0.08, y: 0.18, r: 1.2, o: 0.7 },
  { x: 0.22, y: 0.42, r: 0.8, o: 0.5 },
  { x: 0.31, y: 0.12, r: 1.0, o: 0.8 },
  { x: 0.45, y: 0.55, r: 0.6, o: 0.4 },
  { x: 0.58, y: 0.22, r: 1.3, o: 0.9 },
  { x: 0.67, y: 0.48, r: 0.7, o: 0.5 },
  { x: 0.78, y: 0.15, r: 1.0, o: 0.7 },
  { x: 0.87, y: 0.38, r: 0.9, o: 0.6 },
  { x: 0.93, y: 0.62, r: 0.5, o: 0.4 },
  { x: 0.15, y: 0.68, r: 0.7, o: 0.5 },
  { x: 0.38, y: 0.28, r: 0.5, o: 0.4 },
  { x: 0.52, y: 0.08, r: 0.8, o: 0.6 },
];

function RoundHistory({
  recentRounds,
}: {
  recentRounds: Array<{ roundId: number; crashPointBps: number }>;
}) {
  if (recentRounds.length === 0) return null;
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h2 className="text-gray-400 text-sm mb-3 font-semibold">
        Recent Rounds
      </h2>
      <div className="flex flex-wrap gap-2">
        {recentRounds.map((r) => {
          const isHigh = r.crashPointBps >= 20_000;
          const isMid = r.crashPointBps >= 15_000;
          const bg = isHigh
            ? "bg-green-700"
            : isMid
              ? "bg-yellow-700"
              : "bg-red-800";
          return (
            <span
              key={r.roundId}
              className={`${bg} text-white text-sm px-2 py-1 rounded font-mono`}
            >
              {formatMultiplier(r.crashPointBps)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
