import type { Tweet as TweetData } from 'react-tweet/api';

/**
 * Normalize tweet shape before passing to EmbeddedTweet.
 *
 * As of 2026-05, react-tweet.vercel.app omits empty entity arrays
 * (hashtags / user_mentions / urls / symbols) instead of returning [],
 * which crashes react-tweet@3.3.0's enrichTweet ("not iterable").
 * We backfill any missing array with [] while preserving other fields
 * (e.g. media) untouched.
 */
export function normalizeTweet(t: TweetData): TweetData {
  const e = (t.entities ?? {}) as Partial<TweetData['entities']>;
  return {
    ...t,
    entities: {
      ...e,
      hashtags: Array.isArray(e.hashtags) ? e.hashtags : [],
      urls: Array.isArray(e.urls) ? e.urls : [],
      user_mentions: Array.isArray(e.user_mentions) ? e.user_mentions : [],
      symbols: Array.isArray(e.symbols) ? e.symbols : [],
    },
  };
}
