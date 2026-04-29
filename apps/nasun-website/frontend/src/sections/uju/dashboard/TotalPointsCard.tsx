import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { UjuCard, UjuButton, UjuSectionHeader } from "../shared";
import { Spinner } from "@/components/ui";

export function TotalPointsCard() {
  const { user } = useAuth();
  const { score, isLoading, refresh, isRefreshing, cooldownSeconds } =
    useEcosystemScore(user?.identityId);

  const allTimePoints = score?.allTime.ecosystemScore ?? 0;
  const multiplier = score?.multiplier ?? 1;

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

          <div className="mt-5 rounded-xl bg-pado-5/10 border border-pado-5/30 p-3">
            <p className="text-base font-medium text-uju-secondary">Multiplier</p>
            <p className="text-xl font-semibold text-pado-5 tabular-nums mt-1">
              {multiplier.toFixed(2)}x
            </p>
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
