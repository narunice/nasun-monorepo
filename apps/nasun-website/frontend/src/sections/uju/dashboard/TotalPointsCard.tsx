import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { UjuCard } from "../shared/UjuCard";
import { Spinner } from "@/components/ui";

export function TotalPointsCard() {
  const { user } = useAuth();
  const { score, isLoading, refresh, isRefreshing, cooldownSeconds } =
    useEcosystemScore(user?.identityId);

  const allTimePoints = score?.allTime.ecosystemScore ?? 0;
  const weeklyPoints = score?.weekly.ecosystemScore ?? 0;
  const multiplier = score?.multiplier ?? 1;

  return (
    <UjuCard>
      <p className="text-sm font-medium text-uju-secondary mb-3">Ecosystem Points</p>

      {isLoading ? (
        <div className="flex items-center justify-center h-16">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          <p className="text-3xl font-bold text-nasun-c3 tabular-nums">
            {allTimePoints.toLocaleString()}
          </p>
          <p className="text-sm text-uju-secondary mt-1">All-time total</p>

          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-uju-primary tabular-nums">
                +{weeklyPoints.toLocaleString()}
              </p>
              <p className="text-sm text-uju-secondary">This week</p>
            </div>
            <div className="text-right">
              <p className="text-base font-semibold text-nasun-c1 tabular-nums">
                {multiplier.toFixed(2)}x
              </p>
              <p className="text-sm text-uju-secondary">Multiplier</p>
            </div>
          </div>
        </>
      )}

      <button
        onClick={refresh}
        disabled={isRefreshing || cooldownSeconds > 0}
        className="mt-4 w-full text-sm text-uju-secondary hover:text-uju-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isRefreshing
          ? "Refreshing..."
          : cooldownSeconds > 0
          ? `Refresh in ${cooldownSeconds}s`
          : "Refresh"}
      </button>
    </UjuCard>
  );
}
