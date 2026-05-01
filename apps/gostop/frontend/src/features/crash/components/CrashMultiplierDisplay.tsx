import { formatMultiplier } from "../crash-math";
import { NextRoundIndicator } from "./CrashSubComponents";

interface CrashMultiplierDisplayProps {
  state: string;
  liveMultiplierBps: number;
  bettingWindowExpired: boolean;
  nextRoundAt: number | null;
  now: number;
  hasCashedOut: boolean;
  recentRounds: Array<{ roundId: number; crashPointBps: number }>;
}

export function CrashMultiplierDisplay({
  state,
  liveMultiplierBps,
  bettingWindowExpired,
  nextRoundAt,
  now,
  hasCashedOut,
  recentRounds,
}: CrashMultiplierDisplayProps) {
  const multiplierColor =
    liveMultiplierBps < 15_000
      ? "text-green-400"
      : liveMultiplierBps < 25_000
        ? "text-yellow-300"
        : "text-orange-400";

  return (
    <div className="text-center">
      {state === "FLYING" || (state === "BETTING" && bettingWindowExpired) ? (
        <span className={`text-4xl sm:text-5xl font-bold ${multiplierColor}`}>
          {formatMultiplier(liveMultiplierBps)}
        </span>
      ) : state === "CRASHED" || state === "RESOLVED" ? (
        <div className="space-y-1">
          <div
            className={`text-4xl sm:text-5xl font-bold ${
              hasCashedOut ? "text-slate-400" : "text-red-400"
            }`}
          >
            {formatMultiplier(
              state === "CRASHED"
                ? liveMultiplierBps
                : (recentRounds[0]?.crashPointBps ?? 10_000),
            )}
          </div>
          <NextRoundIndicator nextRoundAt={nextRoundAt} now={now} />
        </div>
      ) : state === "BETTING" ? (
        <span className="text-2xl text-gray-400">
          Accepting bets...{" "}
          {nextRoundAt
            ? "" // bettingEndsAt logic is handled in CrashPage for now or we can pass it
            : ""}
        </span>
      ) : (
        <NextRoundIndicator nextRoundAt={nextRoundAt} now={now} large />
      )}
    </div>
  );
}
