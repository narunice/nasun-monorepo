/**
 * Pado News Feed Lambda
 *
 * Aggregates crypto news from RSS feeds and X API.
 * Dual trigger:
 *  - API Gateway GET: Returns cached news items
 *  - EventBridge schedule (30min): Warms cache
 *
 * In-memory cache persists across warm Lambda invocations.
 */

import { Handler } from 'aws-lambda';
import { fetchRssFeeds } from './rssFetcher';
import { fetchTweets } from './tweetFetcher';
import {
  ensureHydrated,
  getRssCache, setRssCache,
  getTwitterCache, setTwitterCache,
  canFetchTwitter, recordTwitterFetch,
} from './cache';
import { type NewsItem, type NewsFeedResponse } from './types';

const ALLOWED_ORIGINS = [
  'https://pado.finance',
  'https://staging.pado.finance',
  'http://localhost:5176',
  'https://nasun.io',
  'https://staging.nasun.io',
  'http://localhost:5174',
];

type Audience = 'pado' | 'uju';

function filterByAudience(items: NewsItem[], audience: Audience): NewsItem[] {
  if (audience === 'uju') {
    // Uju feed: only KOL tweets. Drop RSS and Pado-tagged tweets.
    return items.filter(i => i.source === 'twitter' && i.audience === 'uju');
  }
  // Pado feed (default): RSS + media tweets. Drop Uju-tagged tweets.
  return items.filter(i => i.audience !== 'uju');
}

function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

async function getNewsItems(limit: number, audience: Audience): Promise<NewsFeedResponse> {
  await ensureHydrated();

  const sources = { rss: false, twitter: false };
  const allItems: NewsItem[] = [];

  // 1. RSS feeds (5 min cache). Skip entirely for Uju audience — KOL feed is tweet-only.
  if (audience !== 'uju') {
    let rssItems = getRssCache();
    if (!rssItems) {
      rssItems = await fetchRssFeeds();
      await setRssCache(rssItems);
      sources.rss = true;
      console.log(`RSS: fetched ${rssItems.length} items`);
    } else {
      console.log(`RSS: cache hit (${rssItems.length} items)`);
    }
    allItems.push(...rssItems);
  }

  // 2. X API tweets (60 min cache, budget-aware). Single search covers both audiences.
  let twitterItems = getTwitterCache();
  if (!twitterItems) {
    if (canFetchTwitter()) {
      twitterItems = await fetchTweets();
      if (twitterItems.length > 0) {
        await setTwitterCache(twitterItems);
        await recordTwitterFetch(twitterItems.length);
      }
      sources.twitter = true;
      console.log(`Twitter: fetched ${twitterItems.length} tweets`);
    } else {
      console.warn('Twitter: monthly budget exceeded, skipping');
      twitterItems = [];
    }
  } else {
    console.log(`Twitter: cache hit (${twitterItems.length} items)`);
  }
  allItems.push(...twitterItems);

  const filtered = filterByAudience(allItems, audience);
  filtered.sort((a, b) => b.timestamp - a.timestamp);

  return {
    items: filtered.slice(0, limit),
    fetchedAt: new Date().toISOString(),
    sources,
  };
}

export const handler: Handler = async (event) => {
  const startTime = Date.now();
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const headers = getCorsHeaders(origin);

  try {
    // Determine trigger source
    const isScheduledEvent = event?.source === 'aws.events';
    const isOptionsRequest = event?.httpMethod === 'OPTIONS';

    // Handle CORS preflight
    if (isOptionsRequest) {
      return { statusCode: 200, headers, body: '' };
    }

    // Parse and validate limit from query string
    const raw = parseInt(event?.queryStringParameters?.limit || '20', 10);
    const limit = Number.isNaN(raw) ? 20 : Math.min(Math.max(1, raw), 50);

    // Audience routing: Uju gets KOL tweets only, default (Pado) gets RSS + media tweets.
    const audienceParam = event?.queryStringParameters?.audience;
    const audience: Audience = audienceParam === 'uju' ? 'uju' : 'pado';

    const response = await getNewsItems(limit, audience);
    const elapsed = Date.now() - startTime;

    if (isScheduledEvent) {
      console.log(JSON.stringify({
        trigger: 'schedule',
        rss_count: response.items.filter(i => i.source === 'rss').length,
        twitter_count: response.items.filter(i => i.source === 'twitter').length,
        elapsed_ms: elapsed,
      }));
      return { statusCode: 200, body: 'Cache warmed' };
    }

    console.log(JSON.stringify({
      trigger: 'api',
      items: response.items.length,
      elapsed_ms: elapsed,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'error', message: message.slice(0, 500), elapsed_ms: elapsed }));

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
