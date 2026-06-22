// HTTP handlers for the box leaderboard INTERNAL routes (AWS-exit Stage 4, leaderboard Step 5). Mirror the
// leaderboard-v3 lambda internal-* handlers' request/response contracts. The X-Internal-Auth shared-secret
// gate is applied by server.ts (internalRoute); these run after auth. Each returns {status, body}. The
// callers (box identity-compute) treat them as best-effort/fire-and-forget, but they still report per-step
// outcomes for debuggability.

import { getVotingRank, clearTelegramBadge, telegramVerified, syncProfile } from './internal-db';
import { PUBLIC_AVATARS_BASE_URL } from './config';

export type Result = { status: number; body: Record<string, unknown> };

// POST /v3/leaderboard/internal/voting-rank  { twitterHandle? } -> { rank: number | null }
// twitterHandle is OPTIONAL: a wallet with no linked X has no rank (mirror getUserRank(undefined)=null).
export async function votingRankHandler(body: Record<string, unknown>): Promise<Result> {
  const handle = typeof body.twitterHandle === 'string' && body.twitterHandle ? body.twitterHandle : undefined;
  const rank = await getVotingRank(handle);
  return { status: 200, body: { rank } };
}

// POST /v3/leaderboard/internal/clear-telegram  { twitterHandle } -> { ok, updated, reason? }
export async function clearTelegramHandler(body: Record<string, unknown>): Promise<Result> {
  const twitterHandle = body.twitterHandle;
  if (!twitterHandle || typeof twitterHandle !== 'string') {
    return { status: 400, body: { error: 'twitterHandle is required' } };
  }
  const r = await clearTelegramBadge(twitterHandle);
  return { status: 200, body: r.updated ? { ok: true, updated: true } : { ok: true, updated: false, reason: r.reason } };
}

// POST /v3/leaderboard/internal/telegram-verified
//   { identityId, telegramUserId, telegramUsername?, twitterHandle? } -> { ok }
export async function telegramVerifiedHandler(body: Record<string, unknown>): Promise<Result> {
  const identityId = body.identityId;
  const telegramUserId = body.telegramUserId;
  const twitterHandle = typeof body.twitterHandle === 'string' && body.twitterHandle ? body.twitterHandle : null;
  const telegramUsername = typeof body.telegramUsername === 'string' ? body.telegramUsername : null;
  if (!identityId || typeof identityId !== 'string') {
    return { status: 400, body: { error: 'identityId is required' } };
  }
  if (typeof telegramUserId !== 'string' || !/^\d{1,20}$/.test(telegramUserId)) {
    return { status: 400, body: { error: 'valid telegramUserId is required' } };
  }
  await telegramVerified({ identityId, telegramUserId, telegramUsername, twitterHandle });
  return { status: 200, body: { ok: true } };
}

// POST /v3/leaderboard/internal/sync-profile  { twitterHandle } -> { ok, updated, reason? }
export async function syncProfileHandler(body: Record<string, unknown>): Promise<Result> {
  const twitterHandle = body.twitterHandle;
  if (!twitterHandle || typeof twitterHandle !== 'string') {
    return { status: 400, body: { error: 'twitterHandle is required' } };
  }
  const r = await syncProfile(twitterHandle, PUBLIC_AVATARS_BASE_URL);
  return { status: 200, body: r.updated ? { ok: true, updated: true } : { ok: true, updated: false, reason: r.reason } };
}
