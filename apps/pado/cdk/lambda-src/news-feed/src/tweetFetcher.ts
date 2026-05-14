/**
 * X API v2 Tweet Fetcher
 * Fetches recent crypto-related tweets from tracked accounts.
 * Uses raw fetch() — no Twitter SDK dependency.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { type NewsItem, type TwitterSearchResult } from './types';

const X_API_BASE = 'https://api.twitter.com/2';
const SECRET_NAME = process.env.X_API_SECRET_NAME || 'pado/x-api-bearer-token';

// Pado-facing media outlets
const MEDIA_ACCOUNTS = ['CoinDesk', 'Cointelegraph', 'whale_alert'];

// Uju-facing KOL accounts (crypto thought leaders)
const KOL_ACCOUNTS = [
  'scottmelker', 'benjamincowen', 'coinbureau', 'kaiynne', 'tayvano_',
  'hosseeb', 'tarunchitra', 'tomhschmidt', 'ramahluwalia', 'austincampbell',
  'perkinscr97', 'kkirkbos', 'MikeIppolito_', 'JasonYanowitz', 'santiagoroel',
  'patrick_oshag', 'Rewkang',
];

// Lowercase set for fast audience routing
const KOL_LOOKUP = new Set(KOL_ACCOUNTS.map(a => a.toLowerCase()));

// Single combined query with a wide max_results window so high-volume MEDIA
// outlets can't crowd out KOL tweets — partitioning happens in-code after
// fetch. Halves X API call count vs. the previous per-audience split.
const ALL_ACCOUNTS = [...MEDIA_ACCOUNTS, ...KOL_ACCOUNTS];
const COMBINED_QUERY = '(' + ALL_ACCOUNTS.map(a => `from:${a}`).join(' OR ') + ') -is:retweet -is:reply';
const PER_AUDIENCE_CAP = 10;

function audienceFor(username: string): 'pado' | 'uju' {
  return KOL_LOOKUP.has(username.toLowerCase()) ? 'uju' : 'pado';
}

// Secrets Manager client (reused across invocations)
const secretsClient = new SecretsManagerClient({ region: 'ap-northeast-2' });
let cachedBearerToken: string | null = null;

async function getBearerToken(): Promise<string> {
  if (cachedBearerToken) return cachedBearerToken;

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: SECRET_NAME })
  );

  if (!response.SecretString) {
    throw new Error('X API bearer token secret is empty');
  }

  cachedBearerToken = response.SecretString;
  return cachedBearerToken;
}

function tweetToNewsItem(
  tweet: { id: string; text: string; created_at: string; author_id: string; attachments?: { media_keys?: string[] } },
  userMap: Map<string, { username: string; name: string }>,
  mediaMap: Map<string, string>
): NewsItem {
  const user = userMap.get(tweet.author_id);
  const username = user?.username || 'unknown';
  const timestamp = new Date(tweet.created_at).getTime();

  // Clean tweet text: remove URLs for cleaner display
  const cleanText = tweet.text.replace(/https?:\/\/\S+/g, '').trim();

  // Extract first image from attachments
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
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = (await response.text()).slice(0, 200);
    throw new Error(`X API error ${response.status}: ${errorBody}`);
  }

  const data: TwitterSearchResult = await response.json();
  if (!data.data || data.data.length === 0) return [];

  const userMap = new Map<string, { username: string; name: string }>();
  if (data.includes?.users) {
    for (const user of data.includes.users) {
      userMap.set(user.id, { username: user.username, name: user.name });
    }
  }

  const mediaMap = new Map<string, string>();
  if (data.includes?.media) {
    for (const m of data.includes.media) {
      const imgUrl = m.url || m.preview_image_url;
      if (imgUrl) mediaMap.set(m.media_key, imgUrl);
    }
  }

  return data.data.map(tweet => tweetToNewsItem(tweet, userMap, mediaMap));
}

export async function fetchTweets(): Promise<NewsItem[]> {
  try {
    const bearerToken = await getBearerToken();

    // One combined call with a wide window (max_results=50). MEDIA outlets
    // post far more than KOLs, so without an in-code cap they would still
    // crowd out KOLs. Cap each audience at PER_AUDIENCE_CAP, newest first.
    const tweets = await searchTweets(bearerToken, COMBINED_QUERY, 50).catch(err => {
      console.error('Tweet search failed:', err instanceof Error ? err.message : err);
      return [] as NewsItem[];
    });

    const mediaTweets: NewsItem[] = [];
    const kolTweets: NewsItem[] = [];
    for (const t of tweets) {
      if (t.audience === 'uju') {
        if (kolTweets.length < PER_AUDIENCE_CAP) kolTweets.push(t);
      } else {
        if (mediaTweets.length < PER_AUDIENCE_CAP) mediaTweets.push(t);
      }
    }

    return [...mediaTweets, ...kolTweets];
  } catch (error) {
    console.error('Twitter fetch failed:', error);
    return [];
  }
}
