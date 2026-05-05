import { useEffect, useState } from "react";
import { useCrash } from "../features/crash/useCrash";
import { useForceTierDebug } from "../components/celebration";
import { useCrashInvalidationEffect } from "../features/game-history";
import crashThumb from "../assets/images/crash.webp";

// New extractions
import { useCrashCelebration } from "../features/crash/hooks/useCrashCelebration";
import { CrashGraph } from "../features/crash/components/CrashGraph";
import { CrashMultiplierDisplay } from "../features/crash/components/CrashMultiplierDisplay";
import { CrashActionPanel } from "../features/crash/components/CrashActionPanel";
import { CrashRecentHistory, FeaturePreviewTag } from "../features/crash/components/CrashSubComponents";

export default function CrashPage() {
  const crash = useCrash();
  const { myBetRef } = useCrashCelebration(crash);
  useForceTierDebug("Crash");

  // Invalidate game-history cache when a round resolves AND user had a bet
  useCrashInvalidationEffect(crash.roundState?.state, crash.hasBetThisRound);

  const [betInput, setBetInput] = useState("5");
  const [autoInput, setAutoInput] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const state = crash.roundState?.state ?? "IDLE";
  const isBetting = state === "BETTING";
  const isFlying = state === "FLYING";
  const bettingEndsAt = crash.roundState?.bettingEndsAt ?? null;

  const bettingClosingSoon = bettingEndsAt !== null && bettingEndsAt - now < 3_500;
  const bettingWindowExpired = isBetting && bettingEndsAt !== null && now >= bettingEndsAt;
  const showCashOutPanel = crash.hasBetThisRound && (isFlying || bettingWindowExpired);
  const cashOutDisabled = !isFlying || crash.phase === "cashing_out";

  function handleBet() {
    const amount = BigInt(Math.round(parseFloat(betInput) * 1_000_000));
    myBetRef.current = amount;
    crash.placeBet(amount);
  }

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
            <p className="text-xs uppercase tracking-[0.3em] text-gold-300 mb-2">Live Round</p>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-gold">Crash</h1>
            <p className="text-sm lg:text-base text-neutral-200 mt-2 italic">Go or stop. One decision, one multiplier.</p>
            <FeaturePreviewTag />
          </div>
        </header>
      </aside>

      <div className="space-y-6 min-w-0">
        <CrashGraph
          state={state === "BETTING" && bettingWindowExpired ? "FLYING" : state}
          liveMultiplierBps={crash.liveMultiplierBps}
          crashedCrashPoint={state === "RESOLVED" ? (crash.recentRounds[0]?.crashPointBps ?? null) : null}
          hasCashedOut={crash.hasCashedOut}
          myCashoutBps={crash.myCashoutBps}
        />

        <CrashMultiplierDisplay
          state={state}
          liveMultiplierBps={crash.liveMultiplierBps}
          bettingWindowExpired={bettingWindowExpired}
          nextRoundAt={crash.roundState?.nextRoundAt ?? null}
          now={now}
          hasCashedOut={crash.hasCashedOut}
          recentRounds={crash.recentRounds}
        />

        <CrashActionPanel
          crash={crash}
          state={state}
          betInput={betInput}
          setBetInput={setBetInput}
          autoInput={autoInput}
          setAutoInput={setAutoInput}
          handleBet={handleBet}
          handleCashOut={handleCashOut}
          handleAutoSet={handleAutoSet}
          handleAutoClear={handleAutoClear}
          now={now}
          myBetAmount={myBetRef.current}
          bettingClosingSoon={bettingClosingSoon}
          showCashOutPanel={showCashOutPanel}
          cashOutDisabled={cashOutDisabled}
        />

        <CrashRecentHistory recentRounds={crash.recentRounds} />
      </div>
    </div>
  );
}
