import { UjuCard, UjuSectionHeader } from "../shared";
import { useBonusFeed } from "./news/useBonusFeed";
import { NewsCarousel } from "./news/NewsCarousel";

// Container for the My-Account celebration carousel. Wires the bonus feed
// hook to a 4-slide auto-advancing carousel, with graceful states for
// loading / empty / error.
export function NewsEventsCard() {
  const { isLoading, isError, data } = useBonusFeed();
  const entries = data?.data ?? [];
  const cumulativeByCategory = data?.cumulativeByCategory ?? {};

  return (
    <UjuCard className="h-full">
      <UjuSectionHeader accent title="Updates" subtitle="" />

      {isLoading ? (
        <SkeletonSlide />
      ) : isError || entries.length === 0 ? (
        <EmptyState />
      ) : (
        <NewsCarousel
          entries={entries}
          cumulativeByCategory={cumulativeByCategory}
        />
      )}
    </UjuCard>
  );
}

function SkeletonSlide() {
  return (
    <div
      className="relative w-full min-h-[244px] sm:min-h-[260px] rounded-md overflow-hidden bg-gray-950/40 border border-uju-border/30 animate-pulse"
      aria-hidden
    >
      <div className="p-5 sm:p-6 flex flex-col h-full justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-24 rounded-full bg-uju-border/30" />
        </div>
        <div className="space-y-2">
          <div className="h-5 w-3/4 rounded bg-uju-border/30" />
          <div className="h-4 w-1/2 rounded bg-uju-border/20" />
        </div>
        <div className="h-12 w-32 rounded bg-uju-border/30" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative w-full min-h-[244px] sm:min-h-[260px] rounded-md overflow-hidden bg-[radial-gradient(120%_80%_at_50%_30%,rgba(94,225,228,0.10),transparent_60%)] border border-uju-border/30">
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-pado-3/10 border border-pado-3/30 flex items-center justify-center mb-3">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-pado-3"
            aria-hidden="true"
          >
            <path d="M12 3l1.9 4.6L18 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4L12 3z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-uju-primary">
          No bonus rewards yet
        </p>
        <p className="text-sm text-uju-secondary/80 mt-1 max-w-xs">
          Climb the weekly leaderboards or report bugs to earn celebration cards
          here.
        </p>
      </div>
    </div>
  );
}
