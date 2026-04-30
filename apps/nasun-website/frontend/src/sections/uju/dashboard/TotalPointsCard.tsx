import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { UjuCard, UjuSectionHeader } from "../shared";
import { Spinner } from "@/components/ui";

interface TotalPointsCardProps {
  /** Render only the body (no outer UjuCard) for use inside a combined card. */
  bare?: boolean;
}

export function TotalPointsCard({ bare = false }: TotalPointsCardProps = {}) {
  const { user } = useAuth();
  const { score, isLoading } = useEcosystemScore(user?.identityId);

  const allTimePoints = score?.allTime.ecosystemScore ?? 0;

  const body = (
    <>
      <UjuSectionHeader accent title="Nasun Points" />
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
    </>
  );

  if (bare) return <div className="flex flex-col">{body}</div>;
  return (
    <UjuCard variant="accent" className="flex flex-col h-full">
      {body}
    </UjuCard>
  );
}
