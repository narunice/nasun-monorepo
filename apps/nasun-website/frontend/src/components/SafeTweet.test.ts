import { describe, it, expect } from 'vitest';
import { normalizeTweet } from './safeTweetUtils';
import type { Tweet as TweetData } from 'react-tweet/api';

// Minimal shape stand-in for a fetched tweet. The fields outside `entities`
// are irrelevant to the normalizer; cast through `unknown` to satisfy TS.
const base = {
  __typename: 'Tweet',
  lang: 'en',
  favorite_count: 0,
  created_at: '',
  display_text_range: [0, 0],
  text: '',
  user: {},
  id_str: '1',
  conversation_count: 0,
  news_action_type: 'conversation',
  isEdited: false,
  isStaleEdit: false,
} as unknown;

function withEntities(entities: unknown): TweetData {
  return { ...(base as object), entities } as TweetData;
}

describe('normalizeTweet', () => {
  it('fills missing entity arrays with empty arrays', () => {
    // Upstream now omits empty entity keys instead of returning [].
    const result = normalizeTweet(withEntities({ hashtags: [{ text: 'foo', indices: [0, 0] }] }));
    expect(result.entities.hashtags).toHaveLength(1);
    expect(result.entities.urls).toEqual([]);
    expect(result.entities.user_mentions).toEqual([]);
    expect(result.entities.symbols).toEqual([]);
  });

  it('handles entirely missing entities object', () => {
    const result = normalizeTweet({ ...(base as object) } as TweetData);
    expect(result.entities.hashtags).toEqual([]);
    expect(result.entities.urls).toEqual([]);
    expect(result.entities.user_mentions).toEqual([]);
    expect(result.entities.symbols).toEqual([]);
  });

  it('preserves non-array entity fields (e.g. media)', () => {
    const media = [{ display_url: 'pic.x.com/abc', expanded_url: '', indices: [0, 0], url: '' }];
    const result = normalizeTweet(withEntities({ media }));
    expect(result.entities.media).toEqual(media);
  });

  it('coerces non-array values to empty arrays', () => {
    const result = normalizeTweet(withEntities({ hashtags: null, urls: undefined }));
    expect(result.entities.hashtags).toEqual([]);
    expect(result.entities.urls).toEqual([]);
  });

  it('keeps populated arrays untouched', () => {
    const hashtags = [{ text: 'a', indices: [0, 1] as [number, number] }];
    const urls = [{ display_url: 'x.com/a', expanded_url: '', indices: [0, 1] as [number, number], url: '' }];
    const result = normalizeTweet(withEntities({ hashtags, urls, user_mentions: [], symbols: [] }));
    expect(result.entities.hashtags).toBe(hashtags);
    expect(result.entities.urls).toBe(urls);
  });
});
