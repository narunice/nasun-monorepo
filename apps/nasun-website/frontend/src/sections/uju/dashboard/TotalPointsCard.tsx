import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { UjuCard, UjuButton, UjuBadge, UjuSectionHeader } from "../shared";
import { Spinner } from "@/components/ui";

export function TotalPointsCard() {
  const { user } = useAuth();
  const { score, isLoading, refresh, isRefreshing, cooldownSeconds } =
    useEcosystemScore(user?.identityId);

  const allTimePoints = score?.allTime.ecosystemScore ?? 0;
  const weeklyPoints = score?.weekly.ecosystemScore ?? 0;
  const multiplier = score?.multiplier ?? 1;

  const refreshLabel = isRefreshing
    ? "Refreshing..."
    : cooldownSeconds > 0
    ? `Refresh in ${cooldownSeconds}s`
    : "Refresh";

  return (
    <UjuCard variant="accent">
      <UjuSectionHeader
        accent
        title="Nasun Points"
        trailing={
          <UjuBadge tone={multiplier > 1 ? "amber" : "neutral"}>
            {multiplier.toFixed(2)}x
          </UjuBadge>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          <p className="text-5xl sm:text-6xl font-bold tabular-nums leading-none bg-gradient-to-r from-pado-3 to-pado-4 bg-clip-text text-transparent">
            {allTimePoints.toLocaleString()}
          </p>
          <p className="text-base text-uju-secondary mt-2">All-time total</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-pado-2/10 border border-pado-2/30 p-3">
              <p className="text-base font-medium text-uju-secondary">This week</p>
              <p className="text-xl font-semibold text-pado-3 tabular-nums mt-1">
                +{weeklyPoints.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl bg-pado-4/10 border border-pado-4/30 p-3">
              <p className="text-base font-medium text-uju-secondary">Multiplier</p>
              <p className="text-xl font-semibold text-pado-4 tabular-nums mt-1">
                {multiplier.toFixed(2)}x
              </p>
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
