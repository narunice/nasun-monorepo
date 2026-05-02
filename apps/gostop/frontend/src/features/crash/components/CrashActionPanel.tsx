import { WalletConnect } from "@nasun/wallet-ui";
import { formatMultiplier } from "../crash-math";
import { formatNusdc } from "../../../lib/format";
import { CRASH_MAX_BET } from "../../../lib/gostop-config";
import type { UseCrashResult } from "../useCrash";
import { BetSlider, WaitingPanel } from "./CrashSubComponents";

interface CrashActionPanelProps {
  crash: UseCrashResult;
  state: string;
  betInput: string;
  setBetInput: (v: string) => void;
  autoInput: string;
  setAutoInput: (v: string) => void;
  handleBet: () => void;
  handleCashOut: () => void;
  handleAutoSet: () => void;
  handleAutoClear: () => void;
  now: number;
  myBetAmount: bigint;
  bettingClosingSoon: boolean;
  showCashOutPanel: boolean;
  cashOutDisabled: boolean;
}

export function CrashActionPanel({
  crash,
  state,
  betInput,
  setBetInput,
  autoInput,
  setAutoInput,
  handleBet,
  handleCashOut,
  handleAutoSet,
  handleAutoClear,
  now,
  myBetAmount,
  bettingClosingSoon,
  showCashOutPanel,
  cashOutDisabled,
}: CrashActionPanelProps) {
  const isBetting = state === "BETTING";
  const isFlying = state === "FLYING";

  const betFloat = parseFloat(betInput);
  const betAmountBig = Number.isFinite(betFloat)
    ? BigInt(Math.round(betFloat * NUSDC_UNIT_NUMBER))
    : 0n;
  const overMax = betAmountBig > CRASH_MAX_BET;

  return (
    <div className="bg-gray-800 rounded-xl p-4 sm:p-5 space-y-4">
      {!crash.isWalletConnected ? (
        <WalletConnect />
      ) : crash.cashoutSettlement?.status === "invalid" ? (
        <div className="text-center text-red-400 font-semibold py-4">
          Cashout invalidated by chain
        </div>
      ) : crash.hasCashedOut ? (
        <div className="text-center py-5 sm:py-6">
          <div className="text-xs sm:text-sm uppercase tracking-[0.2em] text-green-300/80 mb-1">
            Cashed out
          </div>
          <div className="text-4xl sm:text-5xl font-extrabold text-green-400 drop-shadow-[0_0_18px_rgba(74,222,128,0.45)]">
            {formatMultiplier(crash.myCashoutBps ?? 10_000)}
          </div>
        </div>
      ) : crash.hasBetThisRound && (state === "CRASHED" || state === "RESOLVED") ? (
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
            <button onClick={handleAutoSet} className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded">
              Set
            </button>
            {crash.autoCashOutBps && (
              <button onClick={handleAutoClear} className="px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded">
                Clear
              </button>
            )}
          </div>
          {crash.autoCashOutBps && (
            <p className="text-xs text-gray-400 text-center">Auto: {formatMultiplier(crash.autoCashOutBps)}</p>
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
          <BetSlider
            value={betInput}
            min={Number(CRASH_MIN_BET) / NUSDC_UNIT_NUMBER}
            max={Number(CRASH_MAX_BET) / NUSDC_UNIT_NUMBER}
            onChange={setBetInput}
          />
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
              onClick={() => setBetInput(String(Number(CRASH_MAX_BET) / NUSDC_UNIT_NUMBER))}
              className="flex-1 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            >
              Max
            </button>
          </div>
          <button
            onClick={handleBet}
            disabled={crash.phase === "placing_bet" || bettingClosingSoon || overMax}
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
          label={crash.hasBetThisRound ? "Waiting for round to start" : "Next round starts soon"}
          targetAt={crash.hasBetThisRound ? (crash.roundState?.bettingEndsAt ?? null) : (crash.roundState?.nextRoundAt ?? null)}
          now={now}
          betAmount={crash.hasBetThisRound ? myBetAmount : 0n}
          isNextRound={!crash.hasBetThisRound}
        />
      )}
      {crash.error && <p className="text-red-400 text-sm text-center">{crash.error}</p>}
    </div>
  );
}
