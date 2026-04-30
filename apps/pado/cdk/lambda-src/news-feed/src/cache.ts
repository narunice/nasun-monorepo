/**
 * Two-tier cache for the news feed Lambda.
 *
 * Tier 1: in-memory (per warm Lambda container). Fastest hit.
 * Tier 2: DynamoDB single-row store. Survives cold starts so we don't
 *         re-hit the X API every time a new container spins up.
 *
 * The DynamoDB row also persists the monthly tweet-read counter so the
 * cap stays accurate across cold starts.
 */

import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { type CacheEntry, type NewsItem } from './types';

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' })
);
const TABLE_NAME = process.env.CACHE_TABLE_NAME;
const CACHE_PK = '__NEWS_CACHE__';

const RSS_TTL_MS = 5 * 60 * 1000;
const TWITTER_TTL_MS = 60 * 60 * 1000;
const TWEET_MONTHLY_LIMIT = 8000;

let rssCache: CacheEntry<NewsItem[]> | null = null;
let twitterCache: CacheEntry<NewsItem[]> | null = null;
let tweetMonthKey = '';
let tweetMonthCount = 0;

// Hydrate flag — DynamoDB read happens once per cold start.
let hydrated = false;

interface PersistedCache {
  pk: string;
  rssData?: NewsItem[];
  rssExpiresAt?: number;
  twitterData?: NewsItem[];
  twitterExpiresAt?: number;
  monthKey?: string;
  monthCount?: number;
}

async function hydrateFromDdb(): Promise<void> {
  if (hydrated || !TABLE_NAME) {
    hydrated = true;
    return;
  }
  try {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { pk: CACHE_PK } })
    );
    const row = res.Item as PersistedCache | undefined;
    const now = Date.now();
    if (row?.rssData && row.rssExpiresAt && row.rssExpiresAt > now) {
      rssCache = { data: row.rssData, expiresAt: row.rssExpiresAt };
    }
    if (row?.twitterData && row.twitterExpiresAt && row.twitterExpiresAt > now) {
      twitterCache = { data: row.twitterData, expiresAt: row.twitterExpiresAt };
    }
    if (row?.monthKey) {
      tweetMonthKey = row.monthKey;
      tweetMonthCount = row.monthCount ?? 0;
    }
  } catch (err) {
    console.warn('DDB cache hydrate failed:', err instanceof Error ? err.message : err);
  } finally {
    hydrated = true;
  }
}

async function persistToDdb(): Promise<void> {
  if (!TABLE_NAME) return;
  try {
    const row: PersistedCache = {
      pk: CACHE_PK,
      rssData: rssCache?.data,
      rssExpiresAt: rssCache?.expiresAt,
      twitterData: twitterCache?.data,
      twitterExpiresAt: twitterCache?.expiresAt,
      monthKey: tweetMonthKey,
      monthCount: tweetMonthCount,
    };
    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: row }));
  } catch (err) {
    console.warn('DDB cache persist failed:', err instanceof Error ? err.message : err);
  }
}

export async function ensureHydrated(): Promise<void> {
  await hydrateFromDdb();
}

export function getRssCache(): NewsItem[] | null {
  if (!rssCache || Date.now() > rssCache.expiresAt) return null;
  return rssCache.data;
}

export async function setRssCache(items: NewsItem[]): Promise<void> {
  rssCache = { data: items, expiresAt: Date.now() + RSS_TTL_MS };
  await persistToDdb();
}

export function getTwitterCache(): NewsItem[] | null {
  if (!twitterCache || Date.now() > twitterCache.expiresAt) return null;
  return twitterCache.data;
}

export async function setTwitterCache(items: NewsItem[]): Promise<void> {
  twitterCache = { data: items, expiresAt: Date.now() + TWITTER_TTL_MS };
  await persistToDdb();
}

export function canFetchTwitter(): boolean {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (currentMonth !== tweetMonthKey) {
    tweetMonthKey = currentMonth;
    tweetMonthCount = 0;
  }
  return tweetMonthCount < TWEET_MONTHLY_LIMIT;
}

export async function recordTwitterFetch(count: number): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (currentMonth !== tweetMonthKey) {
    tweetMonthKey = currentMonth;
    tweetMonthCount = 0;
  }
  tweetMonthCount += count;
  console.log(`Twitter usage: ${tweetMonthCount}/${TWEET_MONTHLY_LIMIT} this month`);
  await persistToDdb();
}
