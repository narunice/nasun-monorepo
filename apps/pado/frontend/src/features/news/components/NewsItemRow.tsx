import type { NewsItem } from '../types';

function formatTimeAgo(publishedAt: string): string {
  const diff = Date.now() - new Date(publishedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface Props {
  item: NewsItem;
}

export function NewsItemRow({ item }: Props) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-3 py-2 hover:bg-theme-bg-tertiary transition-colors border-b border-theme-border last:border-b-0"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-trading-xs text-theme-text-primary leading-tight line-clamp-2">
            {item.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[10px] font-medium ${
              item.source === 'twitter' ? 'text-blue-400' : 'text-theme-text-muted'
            }`}>
              {item.sourceLabel}
            </span>
            <span className="text-[10px] text-theme-text-muted">
              {formatTimeAgo(item.publishedAt)}
            </span>
          </div>
        </div>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          className="text-theme-text-muted shrink-0 mt-0.5"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>
    </a>
  );
}
