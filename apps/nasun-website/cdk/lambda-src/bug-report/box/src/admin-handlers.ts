// Admin handlers (box port of the bug-report lambda bug-report-admin index.ts + creator-posts-admin.ts).
//  GET   /admin/bug-reports                  list by status (+ screenshot URLs + profile enrich)
//  PATCH /admin/bug-reports/{reportId}       update status/note/bonusPoints (+ points reward pipeline)
//  GET   /admin/creator-posts                list by status (keyset cursor)
//  PATCH /admin/creator-posts/{postId}/score    score 1..30
//  PATCH /admin/creator-posts/{postId}/reject   reject with reason
//  POST  /admin/creator-posts/{postId}/grant    grant points (idempotent, irrevocable)

import type { Result } from './result';
import {
  getReport, listReportsByStatus, getPost, listPostsByStatus,
} from './db';
import {
  updateReportAdmin, setReportAttributes, scorePost, rejectPost, commitGrant,
} from './write-db';
import { readProfileByIdentity, sendBugReportReward, sendCreatorPostReward } from './clients';
import { signGetUrl } from './screenshots';
import { encodeCursor, decodeCursor } from './creator-posts-utils';

// ---- bug-reports admin ---------------------------------------------------------------------------

const VALID_BUG_STATUSES = ['new', 'investigating', 'in-progress', 'fixed', 'wont-fix', 'accepted', 'declined', 'duplicate'];
const REWARD_TRIGGER_STATUSES = new Set(['fixed', 'accepted']);
const MAX_BONUS_POINTS = 100;
const FEEDBACK_CATEGORIES = new Set(['Feedback', 'Feature Request']);

function attachScreenshotUrls(report: Record<string, unknown>): Record<string, unknown> {
  const keys = report.screenshotKeys as string[] | undefined;
  if (!keys || keys.length === 0) return report;
  const urls = keys.map((k) => signGetUrl(k)).filter((u): u is string => Boolean(u));
  return { ...report, screenshotUrls: urls };
}

async function attachUserProfiles(reports: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const ids = [...new Set(reports.map((r) => r.identityId as string).filter(Boolean))];
  if (ids.length === 0) return reports;

  const profileMap = new Map<string, { twitterHandle?: string; profileImageUrl?: string; customDisplayName?: string }>();
  await Promise.all(ids.map(async (id) => {
    const item = await readProfileByIdentity(id);
    if (item) {
      profileMap.set(id, {
        twitterHandle: item.twitterHandle as string | undefined,
        profileImageUrl: item.profileImageUrl as string | undefined,
        customDisplayName: item.customDisplayName as string | undefined,
      });
    }
  }));

  return reports.map((report) => {
    const profile = profileMap.get(report.identityId as string);
    if (!profile) return report;
    return {
      ...report,
      twitterHandle: profile.twitterHandle,
      profileImageUrl: profile.profileImageUrl,
      displayName: profile.customDisplayName,
    };
  });
}

export async function handleBugReportList(query: { status?: string }): Promise<Result> {
  const statusFilter = query.status;
  if (statusFilter && !VALID_BUG_STATUSES.includes(statusFilter)) {
    return { status: 400, body: { error: `Invalid status. Valid: ${VALID_BUG_STATUSES.join(', ')}` } };
  }
  const queryStatus = statusFilter || 'new';
  const rows = await listReportsByStatus(queryStatus, 100);
  let reports = rows.map(attachScreenshotUrls);
  reports = await attachUserProfiles(reports);
  return { status: 200, body: { reports, filter: queryStatus } };
}

export async function handleBugReportUpdate(reportId: string, body: Record<string, unknown>): Promise<Result> {
  if (!reportId) return { status: 400, body: { error: 'reportId is required' } };

  const status = typeof body.status === 'string' ? body.status : undefined;
  const adminNote = body.adminNote;
  const bonusPoints = body.bonusPoints;
  const timestamp = body.timestamp;

  if (status && !VALID_BUG_STATUSES.includes(status)) {
    return { status: 400, body: { error: `Invalid status. Valid: ${VALID_BUG_STATUSES.join(', ')}` } };
  }
  if (bonusPoints !== undefined) {
    if (typeof bonusPoints !== 'number' || bonusPoints < 0 || bonusPoints > MAX_BONUS_POINTS) {
      return { status: 400, body: { error: `bonusPoints must be 0-${MAX_BONUS_POINTS}` } };
    }
  }
  // Truthiness guard (parity with the lambda `body.adminNote && ...`): a null/empty adminNote skips the length
  // check and is written through as-is; only a truthy non-string or >1000 string is rejected.
  if (adminNote && (typeof adminNote !== 'string' || (adminNote as string).length > 1000)) {
    return { status: 400, body: { error: 'adminNote too long (max 1000 characters)' } };
  }
  // timestamp required for API-contract parity (frontend sends it); box keys on report_id (unique).
  if (!timestamp) {
    return { status: 400, body: { error: 'timestamp is required to identify the report' } };
  }

  const existing = await getReport(reportId);
  if (!existing) return { status: 404, body: { error: 'Bug report not found' } };

  // Build the attribute patch (adminNote / bonusPoints) + updatedAt; status is the promoted column.
  const patch: Record<string, unknown> = {};
  if (adminNote !== undefined) patch.adminNote = adminNote;
  if (bonusPoints !== undefined) patch.bonusPoints = bonusPoints;
  if (!status && adminNote === undefined && bonusPoints === undefined) {
    return { status: 400, body: { error: 'No fields to update' } };
  }
  patch.updatedAt = new Date().toISOString();
  await updateReportAdmin(reportId, status ?? null, patch);

  // Reward pipeline (parity with the lambda; computed from the pre-update `existing` snapshot + body).
  let rewardResult: { success: boolean; created?: boolean; finalPoints?: number; error?: string } | null = null;

  const effectiveStatus = status ?? (existing.status as string | undefined);
  const effectivePoints =
    typeof bonusPoints === 'number' && bonusPoints > 0
      ? bonusPoints
      : typeof existing.bonusPoints === 'number' && existing.bonusPoints > 0
        ? (existing.bonusPoints as number)
        : 0;
  const creditedAmount = typeof existing.creditedAmount === 'number' ? (existing.creditedAmount as number) : 0;

  if (effectiveStatus && REWARD_TRIGGER_STATUSES.has(effectiveStatus) && effectivePoints > 0) {
    const walletAddress = existing.walletAddress as string | undefined;
    const identityId = existing.identityId as string;
    const rewardType: 'feedback' | 'bug-report' =
      FEEDBACK_CATEGORIES.has(existing.category as string) ? 'feedback' : 'bug-report';

    if (!walletAddress) {
      if (existing.rewardStatus !== 'rewarded') {
        await setReportAttributes(reportId, { rewardStatus: 'pending-no-wallet' });
      }
      rewardResult = { success: false, error: 'User has no wallet address. Reward pending.' };
    } else if (creditedAmount >= effectivePoints) {
      rewardResult = { success: true, created: false, finalPoints: creditedAmount, error: 'Already rewarded' };
    } else {
      const delta = effectivePoints - creditedAmount;
      const deltaSeq = typeof existing.deltaSeq === 'number' ? (existing.deltaSeq as number) : 0;
      const isFirstCredit = creditedAmount === 0;
      const deltaSuffix = isFirstCredit ? '' : `-delta-${deltaSeq + 1}`;

      rewardResult = await sendBugReportReward({
        walletAddress,
        identityId,
        reportId: reportId + deltaSuffix,
        points: delta,
        reason:
          `${rewardType === 'feedback' ? 'Feedback' : 'Bug report'} accepted: ${(existing.title as string) || reportId}` +
          (isFirstCredit ? '' : ` (delta credit: ${creditedAmount} -> ${effectivePoints})`),
        type: rewardType,
      });

      if (rewardResult.success) {
        const rewardPatch: Record<string, unknown> = {
          rewardStatus: 'rewarded',
          rewardType,
          creditedAmount: effectivePoints,
        };
        if (!isFirstCredit) rewardPatch.deltaSeq = deltaSeq + 1;
        await setReportAttributes(reportId, rewardPatch);
      } else {
        await setReportAttributes(reportId, { rewardStatus: 'pending', rewardType });
      }
    }
  }

  return { status: 200, body: { success: true, reportId, ...(rewardResult ? { reward: rewardResult } : {}) } };
}

// ---- creator-posts admin -------------------------------------------------------------------------

const VALID_POST_STATUSES = ['PENDING', 'SCORED', 'GRANTED', 'REJECTED', 'CANCELED'];
const ADMIN_LIMIT_DEFAULT = 50;
const ADMIN_LIMIT_MAX = 100;

// direct walletAddress, else the linked Nasun wallet, else the linked MetaMask address (parity with the lambda
// creator-posts-admin resolveWalletAddress).
function resolveWalletAddress(profileItem: Record<string, any> | undefined): string | undefined {
  if (!profileItem) return undefined;
  const direct = profileItem.walletAddress as string | undefined;
  const linked = profileItem.linkedAccounts as {
    metamask?: { walletAddress?: string };
    'nasun wallet'?: { walletAddress?: string };
  } | undefined;
  return direct || linked?.['nasun wallet']?.walletAddress || linked?.metamask?.walletAddress;
}

export async function handleCreatorPostsList(query: { status?: string; limit?: string; cursor?: string }): Promise<Result> {
  const statusParam = query.status || 'PENDING';
  if (!VALID_POST_STATUSES.includes(statusParam)) {
    return { status: 400, body: { error: `Invalid status. Valid: ${VALID_POST_STATUSES.join(', ')}` } };
  }
  const rawLimit = parseInt(query.limit || '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= ADMIN_LIMIT_MAX ? rawLimit : ADMIN_LIMIT_DEFAULT;
  const cursor = decodeCursor(query.cursor);

  const items = await listPostsByStatus(statusParam, limit, cursor);
  const nextCursor = items.length === limit
    ? encodeCursor({ createdAt: items[items.length - 1].createdAt as string, postId: items[items.length - 1].postId as string })
    : undefined;
  return { status: 200, body: { items, filter: statusParam, nextCursor } };
}

export async function handleCreatorPostScore(postId: string, adminId: string, body: Record<string, unknown>): Promise<Result> {
  if (!postId) return { status: 400, body: { error: 'postId is required' } };
  const points = body.points;
  if (typeof points !== 'number' || !Number.isInteger(points) || points < 1 || points > 30) {
    return { status: 400, body: { error: 'points must be integer 1-30' } };
  }
  const now = new Date().toISOString();
  const ok = await scorePost(postId, { scoredPoints: points, scoredAt: now, scoredByAdminId: adminId });
  if (!ok) return { status: 409, body: { error: 'invalid_state', message: 'Only PENDING/SCORED posts can be scored.' } };
  console.log(`action=score postId=${postId} adminId=${adminId} points=${points}`);
  return { status: 200, body: { postId, status: 'SCORED', scoredPoints: points, scoredAt: now } };
}

export async function handleCreatorPostReject(postId: string, adminId: string, body: Record<string, unknown>): Promise<Result> {
  if (!postId) return { status: 400, body: { error: 'postId is required' } };
  const reason = (typeof body.reason === 'string' ? body.reason : '').trim();
  if (!reason || reason.length > 500) {
    return { status: 400, body: { error: 'reason is required (max 500 chars)' } };
  }
  const now = new Date().toISOString();
  const ok = await rejectPost(postId, { rejectionReason: reason, scoredByAdminId: adminId, scoredAt: now });
  if (!ok) return { status: 409, body: { error: 'invalid_state' } };
  console.log(`action=reject postId=${postId} adminId=${adminId}`);
  return { status: 200, body: { postId, status: 'REJECTED', rejectionReason: reason } };
}

export async function handleCreatorPostGrant(postId: string, adminId: string): Promise<Result> {
  if (!postId) return { status: 400, body: { error: 'postId is required' } };
  const expectedDigest = `creatorpost:${postId}`;

  const item = await getPost(postId);
  if (!item) return { status: 404, body: { error: 'not_found' } };

  // Tamper guard against a mismatched grantTxDigest.
  if (item.grantTxDigest && item.grantTxDigest !== expectedDigest) {
    console.error(`[creator-posts][GRANT] tampered grantTxDigest postId=${postId} stored=${item.grantTxDigest} expected=${expectedDigest}`);
    return { status: 500, body: { error: 'inconsistent_state' } };
  }
  // Idempotent short-circuit: already GRANTED with matching digest.
  if (item.status === 'GRANTED' && item.grantTxDigest === expectedDigest) {
    console.log(`action=grant postId=${postId} adminId=${adminId} idempotent=true`);
    return { status: 200, body: { postId, status: 'GRANTED', scoredPoints: item.scoredPoints, grantedAt: item.grantedAt, idempotent: true } };
  }
  if (item.status !== 'SCORED') {
    return { status: 409, body: { error: 'invalid_state', message: `Only SCORED posts can be granted. Current: ${item.status}` } };
  }

  const scoredPoints = item.scoredPoints as number | undefined;
  if (typeof scoredPoints !== 'number' || scoredPoints < 1 || scoredPoints > 30) {
    return { status: 400, body: { error: 'invalid_scored_points' } };
  }
  const identityId = item.identityId as string;

  // Resolve walletAddress (optional -- points are not money). Box reads the identity-compute mirror.
  let walletAddress: string | undefined;
  try {
    const profileItem = await readProfileByIdentity(identityId);
    walletAddress = resolveWalletAddress(profileItem || undefined);
  } catch (err) {
    console.warn('[creator-posts][GRANT] profile lookup failed (non-fatal):', err instanceof Error ? err.message : err);
  }

  const rewardRes = await sendCreatorPostReward({ identityId, walletAddress, postId, points: scoredPoints });
  if (!rewardRes.ok) {
    console.error(`[creator-posts][GRANT] explorer call failed postId=${postId} err=${rewardRes.error}`);
    return { status: 502, body: { error: 'explorer_unavailable', detail: rewardRes.error } };
  }

  const now = new Date().toISOString();
  const committed = await commitGrant(postId, expectedDigest, {
    grantedAt: now,
    grantTxDigest: expectedDigest,
    grantedByAdminId: adminId,
  });

  if (!committed) {
    // Conditional failed -> re-read to resolve race / invalid state (PG is strongly consistent).
    const current = await getPost(postId);
    if (current?.status === 'GRANTED' && current.grantTxDigest === expectedDigest) {
      console.log(`action=grant postId=${postId} adminId=${adminId} idempotent=raceResolved`);
      return { status: 200, body: { postId, status: 'GRANTED', scoredPoints: current.scoredPoints, grantedAt: current.grantedAt, idempotent: true } };
    }
    if (current?.status === 'REJECTED' || current?.status === 'CANCELED') {
      return { status: 409, body: { error: 'invalid_state', message: `Current: ${current.status}` } };
    }
    console.error(`[creator-posts][GRANT] condition failed but post still SCORED postId=${postId}`);
    return { status: 500, body: { error: 'transient_state' } };
  }

  console.log(`action=grant postId=${postId} adminId=${adminId} identity=${identityId.slice(0, 16)}... points=${scoredPoints} duplicate=${!rewardRes.created}`);
  return { status: 200, body: { postId, status: 'GRANTED', scoredPoints, grantedAt: now, duplicate: !rewardRes.created } };
}
