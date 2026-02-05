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

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function NewsSlide({ item }: { item: NewsItem }) {
  const isTweet = item.source === 'twitter';

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
        <div className={`absolute inset-0 ${
          isTweet
            ? 'bg-gradient-to-br from-slate-900 to-slate-800'
            : 'bg-gradient-to-br from-blue-900/80 to-purple-900/80'
        }`} />
      )}

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />

      {/* Tweet: X logo watermark (top-right) */}
      {isTweet && (
        <div className="absolute top-2.5 right-2.5 z-10">
          <XIcon className="w-4 h-4 text-white/30" />
        </div>
      )}

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          {isTweet ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 text-white/90 font-medium flex items-center gap-1">
              <XIcon className="w-2.5 h-2.5" />
              {item.sourceLabel}
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white/90 font-medium">
              {item.sourceLabel}
            </span>
          )}
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

const MAX_DISPLAY = 20;
const MIN_TWEETS = 5;

function balancedSlice(items: NewsItem[]): NewsItem[] {
  const rss = items.filter(i => i.source === 'rss');
  const tweets = items.filter(i => i.source === 'twitter');

  // Reserve slots for tweets, fill rest with RSS
  const tweetSlots = Math.min(MIN_TWEETS, tweets.length);
  const rssSlots = MAX_DISPLAY - tweetSlots;
  const selected = [
    ...rss.slice(0, rssSlots),
    ...tweets.slice(0, tweetSlots),
  ];

  // Re-sort by timestamp descending
  return selected.sort((a, b) => b.timestamp - a.timestamp);
}

export function NewsCarousel() {
  const { data, isLoading } = useNewsFeed(35);
  const items = data?.items ?? [];
  const displayItems = balancedSlice(items);
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

      {/* Navigation arrows */}
      {displayItems.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goTo((currentIndex - 1 + displayItems.length) % displayItems.length);
            }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors"
            aria-label="Previous news"
          >
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goTo((currentIndex + 1) % displayItems.length);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors"
            aria-label="Next news"
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
