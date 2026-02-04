import { useNewsFeed } from '../hooks/useNewsFeed';
import { NewsItemRow } from './NewsItemRow';

export function NewsCard() {
  const { data, isLoading, error } = useNewsFeed(15);

  return (
    <div className="flex flex-col h-full bg-theme-bg-secondary rounded-lg overflow-hidden border border-theme-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme-border shrink-0">
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-theme-text-muted">
            <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
          </svg>
          <span className="text-trading-sm font-medium text-theme-text-primary">News</span>
        </div>
        {data && (
          <span className="text-[10px] text-theme-text-muted">
            {data.items.length} items
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-trading-xs text-theme-text-muted">Loading news...</span>
          </div>
        )}

        {error && !data && (
          <div className="flex items-center justify-center h-full px-3">
            <span className="text-trading-xs text-theme-text-muted text-center">
              News feed unavailable
            </span>
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="text-trading-xs text-theme-text-muted">No news yet</span>
          </div>
        )}

        {data && data.items.map(item => (
          <NewsItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
