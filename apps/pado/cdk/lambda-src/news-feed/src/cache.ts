/**
 * In-memory cache for Lambda warm invocations.
 * Module-level variables persist across warm invocations.
 */

import { type CacheEntry, type NewsItem } from './types';

// RSS cache: 5 min TTL
let rssCache: CacheEntry<NewsItem[]> | null = null;
const RSS_TTL_MS = 5 * 60 * 1000;

// Twitter cache: 60 min TTL
let twitterCache: CacheEntry<NewsItem[]> | null = null;
const TWITTER_TTL_MS = 60 * 60 * 1000;

// Monthly tweet consumption counter (resets on Lambda cold start or month change)
let tweetMonthKey = '';
let tweetMonthCount = 0;
const TWEET_MONTHLY_LIMIT = 8000; // Safety margin under 10K

export function getRssCache(): NewsItem[] | null {
  if (!rssCache || Date.now() > rssCache.expiresAt) return null;
  return rssCache.data;
}

export function setRssCache(items: NewsItem[]): void {
  rssCache = { data: items, expiresAt: Date.now() + RSS_TTL_MS };
}

export function getTwitterCache(): NewsItem[] | null {
  if (!twitterCache || Date.now() > twitterCache.expiresAt) return null;
  return twitterCache.data;
}

export function setTwitterCache(items: NewsItem[]): void {
  twitterCache = { data: items, expiresAt: Date.now() + TWITTER_TTL_MS };
}

export function canFetchTwitter(): boolean {
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-02"
  if (currentMonth !== tweetMonthKey) {
    tweetMonthKey = currentMonth;
    tweetMonthCount = 0;
  }
  return tweetMonthCount < TWEET_MONTHLY_LIMIT;
}

export function recordTwitterFetch(count: number): void {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (currentMonth !== tweetMonthKey) {
    tweetMonthKey = currentMonth;
    tweetMonthCount = 0;
  }
  tweetMonthCount += count;
  console.log(`Twitter usage: ${tweetMonthCount}/${TWEET_MONTHLY_LIMIT} this month`);
}
