/**
 * NewsCarousel Component
 * Auto-sliding image + headline carousel for crypto news.
 * Each card fills the full container with an image background,
 * gradient overlay, and headline text.
 */

import { useNewsFeed } from '../hooks/useNewsFeed';
import { useCarousel } from '../hooks/useCarousel';
import type { NewsItem } from '../types';

function formatTimeAgo(publishedAt: string): string {
  const diffMs = Date.now() - new Date(publishedAt).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NewsSlide({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full shrink-0 h-full relative block"
    >
      {/* Background */}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 to-purple-900/80" />
      )}

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white/90 font-medium">
            {item.sourceLabel}
          </span>
          <span className="text-[10px] text-white/50">
            {formatTimeAgo(item.publishedAt)}
          </span>
        </div>
        <h3 className="text-sm font-medium text-white line-clamp-3 leading-snug">
          {item.title}
        </h3>
      </div>
    </a>
  );
}

export function NewsCarousel() {
  const { data, isLoading } = useNewsFeed(15);
  const items = data?.items ?? [];
  const displayItems = items.slice(0, 10);
  const { currentIndex, goTo, setPaused } = useCarousel(displayItems.length, 5000);

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg h-full flex items-center justify-center">
        <div className="animate-pulse text-xs text-theme-text-muted">Loading news...</div>
      </div>
    );
  }

  if (displayItems.length === 0) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg h-full flex items-center justify-center">
        <span className="text-xs text-theme-text-muted">No news available</span>
      </div>
    );
  }

  return (
    <div
      className="bg-theme-bg-secondary rounded-lg h-full overflow-hidden relative flex flex-col"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-theme-border flex items-center justify-between shrink-0 z-10">
        <span className="text-xs font-medium text-theme-text-secondary">News</span>
        <span className="text-[10px] text-theme-text-tertiary">
          {currentIndex + 1} / {displayItems.length}
        </span>
      </div>

      {/* Carousel track */}
      <div className="flex-1 relative overflow-hidden">
        <div
          className="flex h-full transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {displayItems.map(item => (
            <NewsSlide key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {displayItems.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.preventDefault(); goTo(i); }}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentIndex ? 'bg-white' : 'bg-white/30'
            }`}
            aria-label={`Go to news ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
