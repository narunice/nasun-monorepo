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
  // Audience routing for tweet items. RSS items are unaudienced (default 'pado').
  audience?: 'pado' | 'uju';
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
    attachments?: { media_keys?: string[] };
  }>;
  includes?: {
    users?: Array<{
      id: string;
      username: string;
      name: string;
    }>;
    media?: Array<{
      media_key: string;
      type: 'photo' | 'video' | 'animated_gif';
      url?: string;
      preview_image_url?: string;
    }>;
  };
}
