/**
 * Pado / Uju News Feed API (box port of the former AWS Lambda `pado-news-feed`).
 *
 * Aggregates crypto news from RSS feeds and the X API, filtered by audience
 * (Pado = RSS + media tweets, Uju = KOL tweets only). Served from the unified
 * chat-server so the AWS Lambda + API Gateway + DynamoDB cache + EventBridge
 * warm rule can be torn down (AWS-exit順서5 de-Lambda).
 *
 * Differences from the Lambda original:
 *  - Cache is plain in-memory. The chat-server is a long-running process with
 *    no cold starts, so the DynamoDB persistence tier the Lambda needed is
 *    unnecessary. The monthly X API counter resets on restart; usage is far
 *    under the cap (warm runs ~2/day vs a 1500/mo ceiling), so this is safe.
 *  - The X API bearer token comes from X_API_BEARER_TOKEN instead of Secrets
 *    Manager.
 *  - The EventBridge 12h warm trigger is replaced by an in-process interval.
 *
 * Route: GET /news-feed?limit=20&audience=pado|uju
 * Frontend (pado .env.production / nasun) already targets api.nasun.io/news-feed;
 * cutover is an nginx repoint of that location to this server, no rebuild.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { XMLParser } from 'fast-xml-parser';

// ===== Types =====

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
  audience?: 'pado' | 'uju';
}

interface NewsFeedResponse {
  items: NewsItem[];
  fetchedAt: string;
  sources: { rss: boolean; twitter: boolean };
}

interface RssFeedConfig {
  url: string;
  label: string;
}

interface TwitterSearchResult {
  data?: Array<{
    id: string;
    text: string;
    created_at: string;
    author_id: string;
    attachments?: { media_keys?: string[] };
  }>;
  includes?: {
    users?: Array<{ id: string; username: string; name: string }>;
    media?: Array<{
      media_key: string;
      type: 'photo' | 'video' | 'animated_gif';
      url?: string;
      preview_image_url?: string;
    }>;
  };
}

type Audience = 'pado' | 'uju';

// ===== RSS fetcher (ported verbatim, security hardening intact) =====

const RSS_FEEDS: RssFeedConfig[] = [
  { url: 'https://cointelegraph.com/rss', label: 'CoinTelegraph' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', label: 'CoinDesk' },
  { url: 'https://decrypt.co/feed', label: 'Decrypt' },
];

const MAX_RSS_BODY_SIZE = 1024 * 1024; // 1 MB

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
  htmlEntities: false,
});

function generateRssId(source: string, title: string): string {
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
  const mediaContent = entry['media:content'] as Record<string, unknown> | undefined;
  if (mediaContent?.['@_url']) {
    const url = String(mediaContent['@_url']);
    if (url.startsWith('https://')) return url;
  }
  const enclosure = entry['enclosure'] as Record<string, unknown> | undefined;
  if (enclosure?.['@_url'] && String(enclosure['@_type'] || '').startsWith('image/')) {
    const url = String(enclosure['@_url']);
    if (url.startsWith('https://')) return url;
  }
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
    const channel = parsed?.rss?.channel;
    if (!channel?.item) return [];
    const items: unknown[] = Array.isArray(channel.item) ? channel.item : [channel.item];
    return items.slice(0, 10).map((item: unknown) => {
      const entry = item as Record<string, unknown>;
      const title = String(entry.title || '').trim();
      const rawLink = String(entry.link || '').trim();
      // https:// only - block javascript:/data: URI injection.
      const link = rawLink.startsWith('https://') ? rawLink : '';
      const description = String(entry.description || '').replace(/<[^>]*>/g, '').trim();
      const pubDate = String(entry.pubDate || '');
      const timestamp = pubDate ? new Date(pubDate).getTime() : Date.now();
      const imageUrl = extractImageUrl(entry);
      return {
        id: generateRssId(feedConfig.label, title),
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
    console.error(`[news] RSS parse failed (${feedConfig.label}):`, error);
    return [];
  }
}

async function fetchRssFeeds(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'PadoNewsFeed/1.0' },
        redirect: 'follow', // CoinDesk 308s on a trailing slash; allow same-host hops
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${feed.label}`);
      // SSRF guard: a redirect must stay on the feed's own host and stay https,
      // so a feed can never be bounced to an internal or other-host endpoint.
      const finalUrl = new URL(response.url);
      if (finalUrl.protocol !== 'https:' || finalUrl.hostname !== new URL(feed.url).hostname) {
        throw new Error(`unsafe redirect for ${feed.label}: ${finalUrl.origin}`);
      }
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_RSS_BODY_SIZE) {
        throw new Error(`RSS body too large from ${feed.label}: ${contentLength} bytes`);
      }
      const xml = await response.text();
      if (xml.length > MAX_RSS_BODY_SIZE) throw new Error(`RSS body exceeded limit from ${feed.label}`);
      return parseRssItems(xml, feed);
    })
  );
  const allItems: NewsItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') allItems.push(...result.value);
    else console.warn('[news] RSS fetch failed:', result.reason);
  }
  const seen = new Set<string>();
  return allItems
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ===== X API tweet fetcher (ported; env token instead of Secrets Manager) =====

const X_API_BASE = 'https://api.twitter.com/2';
const MEDIA_ACCOUNTS = ['CoinDesk', 'Cointelegraph', 'whale_alert'];
const KOL_ACCOUNTS = [
  'scottmelker', 'benjamincowen', 'coinbureau', 'kaiynne', 'tayvano_',
  'hosseeb', 'tarunchitra', 'tomhschmidt', 'ramahluwalia', 'austincampbell',
  'perkinscr97', 'kkirkbos', 'MikeIppolito_', 'JasonYanowitz', 'santiagoroel',
  'patrick_oshag', 'Rewkang',
];
const KOL_LOOKUP = new Set(KOL_ACCOUNTS.map(a => a.toLowerCase()));
const ALL_ACCOUNTS = [...MEDIA_ACCOUNTS, ...KOL_ACCOUNTS];
const COMBINED_QUERY = '(' + ALL_ACCOUNTS.map(a => `from:${a}`).join(' OR ') + ') -is:retweet -is:reply';
const PER_AUDIENCE_CAP = 10;

function audienceFor(username: string): Audience {
  return KOL_LOOKUP.has(username.toLowerCase()) ? 'uju' : 'pado';
}

function getBearerToken(): string | null {
  const token = process.env.X_API_BEARER_TOKEN;
  return token && token.trim() ? token.trim() : null;
}

function tweetToNewsItem(
  tweet: { id: string; text: string; created_at: string; author_id: string; attachments?: { media_keys?: string[] } },
  userMap: Map<string, { username: string; name: string }>,
  mediaMap: Map<string, string>,
): NewsItem {
  const user = userMap.get(tweet.author_id);
  const username = user?.username || 'unknown';
  const timestamp = new Date(tweet.created_at).getTime();
  const cleanText = tweet.text.replace(/https?:\/\/\S+/g, '').trim();
  let imageUrl: string | undefined;
  if (tweet.attachments?.media_keys) {
    for (const key of tweet.attachments.media_keys) {
      const url = mediaMap.get(key);
      if (url) { imageUrl = url; break; }
    }
  }
  return {
    id: `tw-${tweet.id}`,
    source: 'twitter',
    sourceLabel: `@${username}`,
    title: cleanText.length > 140 ? cleanText.slice(0, 140) + '...' : cleanText,
    url: `https://x.com/${username}/status/${tweet.id}`,
    imageUrl,
    publishedAt: new Date(timestamp).toISOString(),
    timestamp,
    audience: audienceFor(username),
  };
}

async function searchTweets(bearerToken: string, query: string, maxResults: number): Promise<NewsItem[]> {
  const params = new URLSearchParams({
    query,
    max_results: String(maxResults),
    'tweet.fields': 'created_at,author_id,attachments',
    expansions: 'author_id,attachments.media_keys',
    'user.fields': 'username,name',
    'media.fields': 'url,preview_image_url,type',
  });
  const response = await fetch(`${X_API_BASE}/tweets/search/recent?${params}`, {
    signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const errorBody = (await response.text()).slice(0, 200);
    throw new Error(`X API error ${response.status}: ${errorBody}`);
  }
  const data: TwitterSearchResult = await response.json();
  if (!data.data || data.data.length === 0) return [];
  const userMap = new Map<string, { username: string; name: string }>();
  for (const user of data.includes?.users || []) {
    userMap.set(user.id, { username: user.username, name: user.name });
  }
  const mediaMap = new Map<string, string>();
  for (const m of data.includes?.media || []) {
    const imgUrl = m.url || m.preview_image_url;
    if (imgUrl) mediaMap.set(m.media_key, imgUrl);
  }
  return data.data.map(tweet => tweetToNewsItem(tweet, userMap, mediaMap));
}

async function fetchTweets(): Promise<NewsItem[]> {
  const bearerToken = getBearerToken();
  if (!bearerToken) {
    console.warn('[news] X_API_BEARER_TOKEN unset, skipping tweet fetch');
    return [];
  }
  try {
    const tweets = await searchTweets(bearerToken, COMBINED_QUERY, 50).catch(err => {
      console.error('[news] tweet search failed:', err instanceof Error ? err.message : err);
      return [] as NewsItem[];
    });
    const mediaTweets: NewsItem[] = [];
    const kolTweets: NewsItem[] = [];
    for (const t of tweets) {
      if (t.audience === 'uju') {
        if (kolTweets.length < PER_AUDIENCE_CAP) kolTweets.push(t);
      } else if (mediaTweets.length < PER_AUDIENCE_CAP) {
        mediaTweets.push(t);
      }
    }
    return [...mediaTweets, ...kolTweets];
  } catch (error) {
    console.error('[news] tweet fetch failed:', error);
    return [];
  }
}

// ===== In-memory cache (replaces the Lambda's DynamoDB tier) =====

const RSS_TTL_MS = 5 * 60 * 1000;
const TWITTER_TTL_MS = 12 * 60 * 60 * 1000;
// Negative-result TTLs: cache empty/failed fetches briefly so a transient X API
// outage (or an RSS hiccup) backs off instead of re-hitting upstream on every
// request. This path has no per-route rate limit, so without it a sustained
// upstream failure would burn the monthly X API budget under normal traffic.
const RSS_EMPTY_TTL_MS = 60 * 1000;
const TWITTER_EMPTY_TTL_MS = 5 * 60 * 1000;
const TWEET_MONTHLY_LIMIT = 1500; // ~$30/mo ceiling at $0.10/read

interface CacheEntry<T> { data: T; expiresAt: number; }
let rssCache: CacheEntry<NewsItem[]> | null = null;
let twitterCache: CacheEntry<NewsItem[]> | null = null;
// Single-flight guards: concurrent misses share one upstream fetch instead of
// stampeding the RSS sources / X API. One shared process serves all traffic, so
// (unlike the per-container Lambda) there is no natural fan-out floor.
let rssInFlight: Promise<NewsItem[]> | null = null;
let twitterInFlight: Promise<NewsItem[]> | null = null;
let tweetMonthKey = '';
let tweetMonthCount = 0;

function canFetchTwitter(): boolean {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (currentMonth !== tweetMonthKey) { tweetMonthKey = currentMonth; tweetMonthCount = 0; }
  return tweetMonthCount < TWEET_MONTHLY_LIMIT;
}

function recordTwitterFetch(count: number): void {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (currentMonth !== tweetMonthKey) { tweetMonthKey = currentMonth; tweetMonthCount = 0; }
  tweetMonthCount += count;
}

function filterByAudience(items: NewsItem[], audience: Audience): NewsItem[] {
  if (audience === 'uju') return items.filter(i => i.source === 'twitter' && i.audience === 'uju');
  return items.filter(i => i.audience !== 'uju');
}

// Return cached RSS items, or fetch once (single-flight) when missing/expired
// or forced (warmer). Empty results get a short TTL so a hiccup backs off.
async function getRssItems(force: boolean): Promise<NewsItem[]> {
  if (!force && rssCache && Date.now() <= rssCache.expiresAt) return rssCache.data;
  if (rssInFlight) return rssInFlight;
  rssInFlight = (async () => {
    try {
      const items = await fetchRssFeeds();
      rssCache = { data: items, expiresAt: Date.now() + (items.length > 0 ? RSS_TTL_MS : RSS_EMPTY_TTL_MS) };
      return items;
    } finally {
      rssInFlight = null;
    }
  })();
  return rssInFlight;
}

// Same single-flight + negative-cache pattern for the X API, plus the monthly
// budget gate. When the budget is exhausted, serve the last cached batch rather
// than an empty feed.
async function getTwitterItems(force: boolean): Promise<NewsItem[]> {
  if (!force && twitterCache && Date.now() <= twitterCache.expiresAt) return twitterCache.data;
  if (twitterInFlight) return twitterInFlight;
  twitterInFlight = (async () => {
    try {
      if (!canFetchTwitter()) {
        console.warn('[news] monthly X API budget exceeded, serving cached');
        return twitterCache?.data ?? [];
      }
      const items = await fetchTweets();
      twitterCache = { data: items, expiresAt: Date.now() + (items.length > 0 ? TWITTER_TTL_MS : TWITTER_EMPTY_TTL_MS) };
      if (items.length > 0) recordTwitterFetch(items.length);
      return items;
    } finally {
      twitterInFlight = null;
    }
  })();
  return twitterInFlight;
}

async function getNewsItems(limit: number, audience: Audience): Promise<NewsFeedResponse> {
  const allItems: NewsItem[] = [];
  if (audience !== 'uju') allItems.push(...await getRssItems(false));
  allItems.push(...await getTwitterItems(false));

  const filtered = filterByAudience(allItems, audience);
  filtered.sort((a, b) => b.timestamp - a.timestamp);
  return {
    items: filtered.slice(0, limit),
    fetchedAt: new Date().toISOString(),
    sources: {
      rss: allItems.some(i => i.source === 'rss'),
      twitter: allItems.some(i => i.source === 'twitter'),
    },
  };
}

// ===== HTTP handler + warmer =====

// CORS allowlist for this cross-origin endpoint (pado.finance + nasun.io
// audiences). Self-contained so it does not depend on the chat-server's global
// ALLOWED_ORIGINS, which is nasun-scoped and (intentionally) omits pado.finance.
// Mirrors the original Lambda's getCorsHeaders (default origin = pado.finance).
const NEWS_ALLOWED_ORIGINS = new Set([
  'https://pado.finance',
  'https://staging.pado.finance',
  'https://nasun.io',
  'https://staging.nasun.io',
  'http://localhost:5176',
  'http://localhost:5174',
]);

function newsCorsHeaders(origin: string | undefined): Record<string, string> {
  const allow = origin && NEWS_ALLOWED_ORIGINS.has(origin) ? origin : 'https://pado.finance';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export async function handleNewsFeedRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const cors = newsCorsHeaders(req.headers.origin);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (req.method !== 'GET') {
    res.writeHead(405, cors);
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }
  const rawLimit = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(1, rawLimit), 50);
  const audience: Audience = url.searchParams.get('audience') === 'uju' ? 'uju' : 'pado';

  const response = await getNewsItems(limit, audience);
  res.writeHead(200, { ...cors, 'Cache-Control': 'public, max-age=60' });
  res.end(JSON.stringify(response));
}

// Force-refresh the Twitter cache on an interval so user requests always hit a
// warm cache and never pay a live X API call. The warm must FORCE (bypass the
// TTL): a plain read would no-op while the cache is still valid, then let it
// expire unrefreshed. Interval < TTL so a refresh always lands before expiry.
// RSS (5min TTL) is cheap and refreshes on demand.
const WARM_INTERVAL_MS = 11 * 60 * 60 * 1000;
let warmTimer: ReturnType<typeof setInterval> | null = null;
let warmBootTimer: ReturnType<typeof setTimeout> | null = null;

export function startNewsFeedWarmer(): void {
  if (warmTimer) return;
  const warm = () => {
    getTwitterItems(true).catch(err =>
      console.error('[news] warm failed:', err instanceof Error ? err.message : err));
  };
  // Delay the boot warm so it does not contend with chat-server startup.
  warmBootTimer = setTimeout(warm, 30_000);
  warmBootTimer.unref?.();
  warmTimer = setInterval(warm, WARM_INTERVAL_MS);
  warmTimer.unref?.();
}

export function stopNewsFeedWarmer(): void {
  if (warmBootTimer) { clearTimeout(warmBootTimer); warmBootTimer = null; }
  if (warmTimer) { clearInterval(warmTimer); warmTimer = null; }
}
