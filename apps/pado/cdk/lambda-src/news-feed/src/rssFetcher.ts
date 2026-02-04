/**
 * RSS Feed Fetcher
 * Fetches and parses RSS feeds from crypto news sources.
 */

import { XMLParser } from 'fast-xml-parser';
import { type NewsItem, type RssFeedConfig } from './types';

const RSS_FEEDS: RssFeedConfig[] = [
  { url: 'https://cointelegraph.com/rss', label: 'CoinTelegraph' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', label: 'CoinDesk' },
  { url: 'https://decrypt.co/feed', label: 'Decrypt' },
];

const MAX_RSS_BODY_SIZE = 1024 * 1024; // 1 MB limit

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
  htmlEntities: false,
});

function generateId(source: string, title: string): string {
  // Simple hash from source + title for deduplication
  let hash = 0;
  const str = `${source}:${title}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `rss-${Math.abs(hash).toString(36)}`;
}

function extractImageUrl(entry: Record<string, unknown>): string | undefined {
  // Priority 1: media:content (CoinTelegraph)
  const mediaContent = entry['media:content'] as Record<string, unknown> | undefined;
  if (mediaContent?.['@_url']) {
    const url = String(mediaContent['@_url']);
    if (url.startsWith('https://')) return url;
  }

  // Priority 2: enclosure with image type (CoinDesk)
  const enclosure = entry['enclosure'] as Record<string, unknown> | undefined;
  if (enclosure?.['@_url'] && String(enclosure['@_type'] || '').startsWith('image/')) {
    const url = String(enclosure['@_url']);
    if (url.startsWith('https://')) return url;
  }

  // Priority 3: media:thumbnail (Decrypt)
  const thumbnail = entry['media:thumbnail'] as Record<string, unknown> | undefined;
  if (thumbnail?.['@_url']) {
    const url = String(thumbnail['@_url']);
    if (url.startsWith('https://')) return url;
  }

  return undefined;
}

function parseRssItems(xml: string, feedConfig: RssFeedConfig): NewsItem[] {
  try {
    const parsed = parser.parse(xml);

    // Handle both RSS 2.0 and Atom formats
    const channel = parsed?.rss?.channel;
    if (!channel?.item) return [];

    const items: unknown[] = Array.isArray(channel.item) ? channel.item : [channel.item];

    return items.slice(0, 10).map((item: unknown) => {
      const entry = item as Record<string, unknown>;
      const title = String(entry.title || '').trim();
      const rawLink = String(entry.link || '').trim();
      // Only allow https:// URLs to prevent javascript: or data: URI injection
      const link = rawLink.startsWith('https://') ? rawLink : '';
      const description = String(entry.description || '').replace(/<[^>]*>/g, '').trim();
      const pubDate = String(entry.pubDate || '');
      const timestamp = pubDate ? new Date(pubDate).getTime() : Date.now();
      const imageUrl = extractImageUrl(entry);

      return {
        id: generateId(feedConfig.label, title),
        source: 'rss' as const,
        sourceLabel: feedConfig.label,
        title,
        summary: description.length > 120 ? description.slice(0, 120) + '...' : description,
        url: link,
        imageUrl,
        publishedAt: new Date(timestamp).toISOString(),
        timestamp,
      };
    }).filter(item => item.title && item.url);
  } catch (error) {
    console.error(`Failed to parse RSS from ${feedConfig.label}:`, error);
    return [];
  }
}

export async function fetchRssFeeds(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'PadoNewsFeed/1.0' },
        redirect: 'error', // Prevent SSRF via redirect to internal endpoints
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${feed.label}`);
      }
      // Enforce body size limit to prevent XML bomb / memory exhaustion
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_RSS_BODY_SIZE) {
        throw new Error(`RSS body too large from ${feed.label}: ${contentLength} bytes`);
      }
      const xml = await response.text();
      if (xml.length > MAX_RSS_BODY_SIZE) {
        throw new Error(`RSS body exceeded limit from ${feed.label}`);
      }
      return parseRssItems(xml, feed);
    })
  );

  const allItems: NewsItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    } else {
      console.warn('RSS fetch failed:', result.reason);
    }
  }

  // Deduplicate by id and sort by timestamp descending
  const seen = new Set<string>();
  return allItems
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}
