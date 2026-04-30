export interface UjuFeedItem {
  id: string;
  source: 'twitter' | 'rss';
  sourceLabel: string;
  title: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  timestamp: number;
  audience?: 'pado' | 'uju';
}

export interface UjuFeedResponse {
  items: UjuFeedItem[];
  fetchedAt: string;
  sources: { rss: boolean; twitter: boolean };
}
