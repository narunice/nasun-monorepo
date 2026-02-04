/**
 * News Feed Types
 */

export interface NewsItem {
  id: string;
  source: 'rss' | 'twitter';
  sourceLabel: string;
  title: string;
  summary?: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  timestamp: number;
}

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface NewsFeedResponse {
  items: NewsItem[];
  fetchedAt: string;
  sources: { rss: boolean; twitter: boolean };
}

export interface RssFeedConfig {
  url: string;
  label: string;
}

export interface TwitterSearchResult {
  data?: Array<{
    id: string;
    text: string;
    created_at: string;
    author_id: string;
  }>;
  includes?: {
    users?: Array<{
      id: string;
      username: string;
      name: string;
    }>;
  };
}
