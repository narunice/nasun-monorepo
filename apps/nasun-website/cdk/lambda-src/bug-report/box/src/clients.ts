// External clients for the box bug-report service.
//
// 1. identity-compute (box loopback :3211): profile reads. The lambda read UserProfiles directly from DynamoDB
//    (admin-list enrich: twitterHandle/profileImageUrl/customDisplayName; creator-post submit: twitterHandle/
//    twitterId/profileImageUrl/linkedAccounts; creator-post grant: walletAddress/linkedAccounts). On box these
//    fields live in the user_profiles mirror; we read them through the canonical identity-compute reader (the
//    SAME /profile/by-identity contract the referral box service + the creator-posts-admin lambda used via
//    _shared/auth/identity-write.ts), which returns the reconstructed DDB-shape profile item. Never throws.
// 2. Telegram Bot API (best-effort notification on submit / reopen).
// 3. box explorer-api (HTTP, x-api-key): bug-report-reward + creator-post-reward (points crediting). Same
//    contract the lambda used; explorer-api gates both with BUG_REPORT_API_KEY.

import { IDENTITY, identitySecret, TELEGRAM, EXPLORER } from './config';

// ---- identity-compute (loopback) -----------------------------------------------------------------

// GET /profile/by-identity -> reconstructed DDB-shape profile item, or null (404 / unconfigured / error).
// NEVER throws (parity with the lambda readProfileFromBox: a miss degrades the call site, not the request).
export async function readProfileByIdentity(identityId: string): Promise<Record<string, any> | null> {
  const secret = identitySecret();
  if (!secret) return null;
  try {
    const qs = new URLSearchParams({ identityId }).toString();
    const res = await fetch(`${IDENTITY.baseUrl}/profile/by-identity?${qs}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(IDENTITY.timeoutMs),
    });
    if (res.status === 200) return (await res.json()) as Record<string, any>;
    return null;
  } catch (err) {
    console.warn('[bug-report] identity by-identity read failed (non-blocking):', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---- Telegram (best-effort) ----------------------------------------------------------------------

export async function sendTelegram(text: string): Promise<void> {
  if (!TELEGRAM.chatId || !TELEGRAM.botToken) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM.chatId, text, disable_web_page_preview: true }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn('[bug-report] Telegram notification failed (best-effort):', err instanceof Error ? err.message : err);
  }
}

// ---- box explorer-api: points rewards (HTTP, x-api-key) ------------------------------------------

export interface BugRewardResult {
  success: boolean;
  created?: boolean;
  finalPoints?: number;
  error?: string;
}

// POST /api/v1/points/bug-report-reward (admin reward path + backfill). 3-attempt exponential backoff,
// 10s timeout. Parity with the lambda sendRewardToExplorer.
export async function sendBugReportReward(payload: {
  walletAddress: string;
  identityId: string;
  reportId: string;
  points: number;
  reason: string;
  type: 'feedback' | 'bug-report';
}): Promise<BugRewardResult> {
  if (!EXPLORER.apiKey) {
    console.warn('[bug-report] EXPLORER_API_URL or BUG_REPORT_API_KEY not configured');
    return { success: false, error: 'Points reward not configured' };
  }
  const url = `${EXPLORER.apiUrl}/api/v1/points/bug-report-reward`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': EXPLORER.apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return (await res.json()) as BugRewardResult;
      const errBody = await res.text();
      console.warn(`[bug-report] explorer reward ${res.status}: ${errBody.slice(0, 200)}`);
    } catch (err) {
      console.warn(`[bug-report] explorer reward failed (attempt ${attempt + 1}):`, err instanceof Error ? err.message : err);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  return { success: false, error: 'Failed to send reward after retries' };
}

// POST /api/v1/points/creator-post-reward (grant). 3-attempt backoff, 10s timeout. 4xx is terminal (no
// retry). Parity with the lambda creator-posts-admin callExplorerReward.
export async function sendCreatorPostReward(payload: {
  identityId: string;
  walletAddress: string | undefined;
  postId: string;
  points: number;
}): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  if (!EXPLORER.apiKey) return { ok: false, error: 'explorer_not_configured' };
  const url = `${EXPLORER.apiUrl}/api/v1/points/creator-post-reward`;
  const bodyObj: Record<string, unknown> = {
    identityId: payload.identityId,
    postId: payload.postId,
    points: payload.points,
  };
  if (payload.walletAddress) bodyObj.walletAddress = payload.walletAddress;

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': EXPLORER.apiKey },
        body: JSON.stringify(bodyObj),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as { created?: boolean };
        return { ok: true, created: !!data.created };
      }
      const text = await res.text();
      console.warn(`[bug-report] creator-post reward attempt ${attempt + 1} failed ${res.status} ${text.slice(0, 200)}`);
      if (res.status >= 400 && res.status < 500) return { ok: false, error: `explorer_${res.status}` };
    } catch (err) {
      clearTimeout(timeout);
      console.warn(`[bug-report] creator-post reward attempt ${attempt + 1} error:`, err instanceof Error ? err.message : err);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  return { ok: false, error: 'explorer_retry_exhausted' };
}
