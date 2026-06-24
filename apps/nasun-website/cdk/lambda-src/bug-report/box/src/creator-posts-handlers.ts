// User-facing creator-posts handlers (box port of the bug-report lambda creator-posts.ts).
//  POST /v1/creator-posts      submit a tweet URL (twitter-linked + handle-match + per-tweet uniqueness)
//  GET  /v1/creator-posts/my   own submissions (keyset cursor, CANCELED excluded)

import type { Result } from './result';
import { CREATOR_POSTS_DAILY_LIMIT } from './config';
import { countTodayPosts, listPostsByIdentity } from './db';
import { insertPost } from './write-db';
import { readProfileByIdentity } from './clients';
import {
  parseTweetUrl,
  normalizeHandle,
  resolveTweetAuthor,
  safeImageUrl,
  startOfUtcTodayIso,
  utcNextMidnightIso,
  encodeCursor,
  decodeCursor,
} from './creator-posts-utils';

export async function handleCreatorPostSubmit(identityId: string, raw: string): Promise<Result> {
  let body: { postUrl?: string };
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }
  const { postUrl } = body;
  if (!postUrl || typeof postUrl !== 'string') {
    return { status: 400, body: { error: 'postUrl is required' } };
  }

  // 1. Load profile: need twitterHandle, twitterId, profileImageUrl (top-level, else linkedAccounts.twitter).
  const profileItem = (await readProfileByIdentity(identityId)) || {};
  const linked = (profileItem.linkedAccounts as
    { twitter?: { twitterHandle?: string; twitterId?: string; profileImageUrl?: string } } | undefined)?.twitter;
  const rawHandle = (profileItem.twitterHandle as string | undefined) ?? linked?.twitterHandle ?? undefined;
  const twitterId = (profileItem.twitterId as string | undefined) ?? linked?.twitterId ?? undefined;
  const rawImage = (profileItem.profileImageUrl as string | undefined) ?? linked?.profileImageUrl ?? undefined;

  if (!rawHandle || !twitterId) {
    return { status: 400, body: { error: 'twitter_not_linked', message: 'Connect your X account first.' } };
  }
  const myHandle = normalizeHandle(rawHandle);
  if (!myHandle) {
    console.warn('[creator-posts] malformed stored handle', { identityId });
    return { status: 400, body: { error: 'twitter_not_linked' } };
  }

  // 2. Parse URL + extract tweet id.
  const parsed = parseTweetUrl(postUrl);
  if (!parsed) {
    return { status: 400, body: { error: 'invalid_url', message: 'Not a valid X post URL.' } };
  }
  const { postId } = parsed;

  // 3. Resolve author for shortlink URLs (x.com/i/status/...).
  let urlHandle = parsed.handle;
  let canonicalUrl = parsed.canonicalUrl;
  if (urlHandle === null) {
    const resolved = await resolveTweetAuthor(postId);
    if (!resolved) {
      return {
        status: 400,
        body: {
          error: 'cannot_resolve_author',
          message:
            'Could not verify the author of this post. Please use the full tweet URL (x.com/yourhandle/status/...).',
        },
      };
    }
    urlHandle = resolved;
    canonicalUrl = `https://x.com/${resolved}/status/${postId}`;
  }

  // 4. Handle match.
  if (urlHandle !== myHandle) {
    return { status: 400, body: { error: 'handle_mismatch', message: 'The URL handle does not match your connected X account.' } };
  }

  // 5. Image allowlist.
  const safeImg = safeImageUrl(rawImage);

  // 6. Rate limit LAST (other failures do not consume quota).
  const todayCount = await countTodayPosts(identityId, startOfUtcTodayIso());
  if (todayCount >= CREATOR_POSTS_DAILY_LIMIT) {
    return {
      status: 429,
      body: { error: 'daily_limit_reached', dailyLimit: CREATOR_POSTS_DAILY_LIMIT, resetAt: utcNextMidnightIso() },
    };
  }

  // 7. Conditional insert (permanent per-tweet uniqueness).
  const now = new Date().toISOString();
  const attributes: Record<string, unknown> = {
    twitterId,
    twitterHandle: myHandle,
    postUrl: canonicalUrl!,
  };
  if (safeImg) attributes.twitterProfileImageUrl = safeImg;

  const inserted = await insertPost(postId, identityId, now, 'PENDING', attributes);
  if (!inserted) {
    return { status: 409, body: { error: 'already_submitted', message: 'This post has already been submitted.' } };
  }

  return {
    status: 200,
    body: {
      postId,
      status: 'PENDING',
      createdAt: now,
      dailyLimit: CREATOR_POSTS_DAILY_LIMIT,
      remainingToday: Math.max(0, CREATOR_POSTS_DAILY_LIMIT - todayCount - 1),
    },
  };
}

const MY_LIMIT_DEFAULT = 10;
const MY_LIMIT_MAX = 50;

export async function handleCreatorPostMyList(
  identityId: string,
  query: { limit?: string; cursor?: string },
): Promise<Result> {
  const rawLimit = parseInt(query.limit || '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= MY_LIMIT_MAX ? rawLimit : MY_LIMIT_DEFAULT;
  const cursor = decodeCursor(query.cursor);

  const items = await listPostsByIdentity(identityId, limit, cursor);
  const nextCursor = items.length === limit
    ? encodeCursor({ createdAt: items[items.length - 1].createdAt as string, postId: items[items.length - 1].postId as string })
    : undefined;

  if (items.length === 0) {
    return { status: 200, body: { items: [], nextCursor } };
  }
  return { status: 200, body: { items, nextCursor, dailyLimit: CREATOR_POSTS_DAILY_LIMIT } };
}
