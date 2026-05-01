import { useUjuFeed } from "./useUjuFeed";
import { useCarousel } from "./useCarousel";
import type { UjuFeedItem } from "./types";

function formatTimeAgo(publishedAt: string): string {
  const diffMs = Date.now() - new Date(publishedAt).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FeedSlide({ item }: { item: UjuFeedItem }) {
  return (
    <div className="w-full shrink-0 h-full relative">
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-slate-900 to-slate-800" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10 pointer-events-none" />
      <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
        <XIcon className="w-4 h-4 text-white/30" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-center gap-1.5 mb-1.5 pointer-events-none">
          <span className="text-sm px-1.5 py-0.5 rounded bg-white/15 text-white/90 font-medium flex items-center gap-1">
            <XIcon className="w-2.5 h-2.5" />
            {item.sourceLabel}
          </span>
          <span className="text-sm text-white/70">{formatTimeAgo(item.publishedAt)}</span>
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-white line-clamp-3 leading-snug hover:text-pado-2 transition-colors cursor-pointer"
        >
          {item.title}
        </a>
      </div>
    </div>
  );
}

export function UjuFeedCarousel() {
  const { data, isLoading, error } = useUjuFeed(20);
  const items = data?.items ?? [];
  const { currentIndex, goTo, snapTo, setPaused, skipTransition } = useCarousel(items.length, 9000);
  const displayIndex = currentIndex >= items.length ? 0 : currentIndex;

  // Clone first slide at end for seamless infinite loop.
  const slides = items.length > 0 ? [...items, items[0]] : [];

  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (e.propertyName === "transform" && currentIndex >= items.length) snapTo(0);
  };

  if (isLoading) {
    return (
      <div className="bg-gray-950/50 backdrop-blur-sm border border-uju-border/60 rounded-lg h-full flex items-center justify-center">
        <span className="animate-pulse text-sm text-uju-secondary">Loading feed...</span>
      </div>
    );
  }

  if (error || items.length === 0) {
    return (
      <div className="bg-gray-950/50 backdrop-blur-sm border border-uju-border/60 rounded-lg h-full flex items-center justify-center">
        <span className="text-sm text-uju-secondary">No feed available</span>
      </div>
    );
  }

  return (
    <div
      className="bg-gray-950/50 backdrop-blur-sm border border-uju-border/60 rounded-lg h-full overflow-hidden relative flex flex-col"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="px-3 py-2 border-b border-uju-border flex items-center justify-between shrink-0 z-10">
        <span className="text-sm font-light text-uju-primary">Feed</span>
        <span className="text-sm text-uju-secondary">
          {displayIndex + 1} / {items.length}
        </span>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div
          className={`flex h-full ${skipTransition ? "" : "transition-transform duration-500 ease-in-out"}`}
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          onTransitionEnd={handleTransitionEnd}
        >
          {slides.map((item, i) => (
            <FeedSlide key={i < items.length ? item.id : `${item.id}-clone`} item={item} />
          ))}
        </div>
      </div>

      {items.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goTo((currentIndex - 1 + items.length) % items.length);
            }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors"
            aria-label="Previous tweet"
          >
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goTo(currentIndex + 1);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors"
            aria-label="Next tweet"
          >
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
