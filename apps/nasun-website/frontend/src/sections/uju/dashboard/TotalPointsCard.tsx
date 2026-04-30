import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { UjuCard, UjuSectionHeader } from "../shared";
import { Spinner } from "@/components/ui";

export function TotalPointsCard() {
  const { user } = useAuth();
  const { score, isLoading, refresh, isRefreshing, cooldownSeconds } =
    useEcosystemScore(user?.identityId);

  const allTimePoints = score?.allTime.ecosystemScore ?? 0;

  const refreshDisabled = isRefreshing || cooldownSeconds > 0;
  const refreshTitle = isRefreshing
    ? "Refreshing..."
    : cooldownSeconds > 0
      ? `Refresh in ${cooldownSeconds}s`
      : "Refresh";

  const refreshIconButton = (
    <button
      type="button"
      onClick={refresh}
      disabled={refreshDisabled}
      title={refreshTitle}
      aria-label={refreshTitle}
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-uju-border/30 text-uju-secondary hover:text-uju-primary hover:border-pado-2/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
    </button>
  );

  return (
    <UjuCard variant="accent" className="flex flex-col h-full">
      <UjuSectionHeader
        accent
        title="Nasun Points"
        trailing={refreshIconButton}
      />

      {isLoading ? (
        <div className="flex items-center justify-center flex-1 min-h-[64px]">
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="flex flex-col mx-auto items-center justify-center flex-1">
          <p className="text-4xl sm:text-5xl md:text-6xl font-semibold tabular-nums leading-none bg-gradient-to-r from-pado-3 to-pado-5 bg-clip-text text-transparent">
            {allTimePoints.toLocaleString()}
          </p>
          <p className="text-base text-uju-secondary mt-2">All-time total</p>
        </div>
      )}
    </UjuCard>
  );
}
