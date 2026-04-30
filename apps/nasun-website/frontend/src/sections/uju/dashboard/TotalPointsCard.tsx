import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { useFilteredTodayScore } from "../missions/useFilteredTodayScore";
import { UjuCard, UjuButton, UjuSectionHeader } from "../shared";
import { Spinner } from "@/components/ui";

export function TotalPointsCard() {
  const { user } = useAuth();
  const { score, isLoading, refresh, isRefreshing, cooldownSeconds } =
    useEcosystemScore(user?.identityId);

  const allTimePoints = score?.allTime.ecosystemScore ?? 0;

  // Today values mirror my-account ProfileHeroCard: filtered base/staking,
  // raw multiplier and the residual goes to "bonus" so the formula always
  // closes (today = base*mult + staking*mult + bonus_residual).
  const { filtered: filteredScore, hasFilteredOutActivity } = useFilteredTodayScore(score);
  const todayBase = filteredScore?.daily.baseScore ?? 0;
  const todayStaking = filteredScore?.daily.stakingScore ?? 0;
  const todayMultiplier = filteredScore?.multiplier ?? 0;
  const todayScore = filteredScore?.daily.ecosystemScore ?? 0;
  const todayBonus = Math.max(
    0,
    todayScore - Math.round((todayBase + todayStaking) * todayMultiplier),
  );

  const refreshLabel = isRefreshing
    ? "Refreshing..."
    : cooldownSeconds > 0
      ? `Refresh in ${cooldownSeconds}s`
      : "Refresh";

  return (
    <UjuCard variant="accent">
      <UjuSectionHeader accent title="Nasun Points" />

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          <p className="text-5xl sm:text-6xl font-bold tabular-nums leading-none bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            {allTimePoints.toLocaleString()}
          </p>
          <p className="text-base text-uju-secondary mt-2">All-time total</p>

          <div className="mt-5 rounded-xl bg-pado-2/5 border border-pado-2/20 p-3">
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
              <span className="text-2xl font-bold text-amber-400 tabular-nums">
                {todayScore.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 1,
                })}
              </span>
              <span
                className="text-sm text-uju-secondary"
                title={
                  hasFilteredOutActivity
                    ? "Today reflects only activities for your activated daily missions. All-time is the full ledger."
                    : undefined
                }
              >
                pts today{hasFilteredOutActivity ? " *" : ""}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline flex-wrap gap-x-1.5 text-sm text-uju-secondary">
              <span>=</span>
              {todayStaking > 0 ? (
                <>
                  <span>(</span>
                  <span className="font-mono text-uju-primary tabular-nums">{todayBase}</span>
                  <span>base</span>
                  <span>+</span>
                  <span
                    className="font-mono text-pado-4 tabular-nums"
                    title="Active stake tier: 1~500 NSN = 1pt, 501~5,000 = 2pt, 5,001+ = 3pt. Updates within ~24h of delegation."
                  >
                    {todayStaking}
                  </span>
                  <span>staking</span>
                  <span>)</span>
                </>
              ) : (
                <>
                  <span className="font-mono text-uju-primary tabular-nums">{todayBase}</span>
                  <span>base</span>
                </>
              )}
              <span>×</span>
              <span
                className={`font-mono tabular-nums ${score?.isPenalized ? "text-red-400" : "text-pado-2"}`}
              >
                {todayMultiplier.toFixed(1)}x
              </span>
              <span>mult</span>
              {score?.isPenalized && (
                <span className="text-red-400/70">(penalized)</span>
              )}
              <span>+</span>
              <span className="font-mono text-pado-5 tabular-nums">{todayBonus}</span>
              <span>bonus</span>
            </div>
          </div>
        </>
      )}

      <UjuButton
        variant="ghost"
        size="sm"
        fullWidth
        onClick={refresh}
        disabled={isRefreshing || cooldownSeconds > 0}
        className="mt-4"
      >
        {refreshLabel}
      </UjuButton>
    </UjuCard>
  );
}
