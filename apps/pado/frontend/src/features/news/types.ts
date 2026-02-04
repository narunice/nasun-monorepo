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

export interface NewsFeedResponse {
  items: NewsItem[];
  fetchedAt: string;
  sources: { rss: boolean; twitter: boolean };
}
