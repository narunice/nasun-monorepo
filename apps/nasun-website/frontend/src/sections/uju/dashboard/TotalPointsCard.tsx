import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { UjuCard, UjuSectionHeader } from "../shared";
import { Spinner } from "@/components/ui";
import { useUserPercentile } from "./useUserPercentile";
import { MultiplierBox } from "./MultiplierBox";

interface TotalPointsCardProps {
  /** Render only the body (no outer UjuCard) for use inside a combined card. */
  bare?: boolean;
}

export function TotalPointsCard({ bare = false }: TotalPointsCardProps = {}) {
  const { user, logout } = useAuth();
  const { score, isLoading, isSessionStale } = useEcosystemScore(user?.identityId);

  const allTimePoints = score?.allTime.ecosystemScore ?? 0;
  // Percentile is currently hidden in the UI but the hook stays wired so the
  // line below can be uncommented without re-plumbing data.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { percentile: _percentile } = useUserPercentile(user?.identityId);

  // The dashboard card no longer carries a refresh control. The Activity tab
  // owns the dedicated refresh button next to the points-today card; the
  // background refetch policy in useEcosystemScore keeps this hero number
  // up-to-date without per-card clutter.

  const body = (
    <>
      <UjuSectionHeader accent title="Nasun Points" />
      {isSessionStale ? (
        <div className="flex flex-col items-center justify-center flex-1 min-h-[64px] gap-3 px-2 text-center">
          <p className="text-sm text-uju-secondary">
            Your session is out of date, so your points can&apos;t load right
            now. Please log in again to refresh them.
          </p>
          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            className="rounded-full bg-gradient-to-r from-pado-3 to-pado-5 px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Log in again
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center flex-1 min-h-[64px]">
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 w-full gap-4">
          <div className="flex flex-col h-full justify-center items-center">
            <p className="text-4xl sm:text-6xl md:text-7xl font-bold tabular-nums leading-none break-all bg-gradient-to-r from-pado-3  to-pado-5 bg-clip-text text-transparent">
              {allTimePoints.toLocaleString('en-US')}
            </p>
            <p className="text-base text-uju-secondary mt-2">All-time total</p>
            {/* Percentile line hidden per UX direction — to re-enable, drop
                the underscore prefix on _percentile above and uncomment: */}
            {/* {_percentile != null && (
              <p className="text-sm text-uju-secondary mt-1">
                Top {_percentile}% of users
              </p>
            )} */}
          </div>
          {/* Multiplier box pinned to the bottom of this column. Matches the
              footer position of the Joined date in the profile column so the
              three Overview columns share a consistent baseline. */}
          <MultiplierBox className="mt-auto" />
        </div>
      )}
    </>
  );

  if (bare) return <div className="flex flex-col h-full w-full">{body}</div>;
  return (
    <UjuCard variant="accent" className="flex flex-col h-full">
      {body}
    </UjuCard>
  );
}
