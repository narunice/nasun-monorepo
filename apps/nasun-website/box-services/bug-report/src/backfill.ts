// Periodic jobs for the box bug-report service (replace the EventBridge-scheduled backfill lambda + add the
// box-FS screenshot prune that the S3 lifecycle would have handled).
//
//  runBackfill  (hourly, parity with the lambda BugReportBackfillSchedule): retry stuck rewards
//               (status fixed/accepted + bonusPoints>0 + rewardStatus null/pending/pending-no-wallet).
//               Idempotent via activity_points UNIQUE + creditedAmount tracking.
//  runPrune     (daily): delete screenshots no longer referenced by a non-terminal report past retention.

import { listBackfillCandidates, listActiveScreenshotKeys } from './db';
import { setReportAttributes } from './write-db';
import { sendBugReportReward } from './clients';
import { pruneScreenshots } from './screenshots';

const FEEDBACK_CATEGORIES = new Set(['Feedback', 'Feature Request']);

export async function runBackfill(): Promise<void> {
  let candidates: Record<string, unknown>[];
  try {
    candidates = await listBackfillCandidates();
  } catch (err) {
    console.error('[bug-report][backfill] candidate scan failed:', err instanceof Error ? err.message : err);
    return;
  }
  console.log(`[bug-report][backfill] candidates=${candidates.length}`);

  let attempted = 0, credited = 0, skipped = 0, failed = 0;

  for (const r of candidates) {
    const walletAddress = r.walletAddress as string | undefined;
    const bonusPoints = (r.bonusPoints as number) || 0;
    const creditedAmount = (r.creditedAmount as number) || 0;
    if (!walletAddress) { skipped++; continue; }
    if (creditedAmount >= bonusPoints) { skipped++; continue; }
    attempted++;

    const delta = bonusPoints - creditedAmount;
    const deltaSeq = (r.deltaSeq as number) || 0;
    const isFirstCredit = creditedAmount === 0;
    const deltaSuffix = isFirstCredit ? '' : `-delta-${deltaSeq + 1}`;
    const rewardType: 'feedback' | 'bug-report' = FEEDBACK_CATEGORIES.has(r.category as string) ? 'feedback' : 'bug-report';
    const reportId = r.reportId as string;

    const result = await sendBugReportReward({
      walletAddress,
      identityId: r.identityId as string,
      reportId: reportId + deltaSuffix,
      points: delta,
      reason:
        `${rewardType === 'feedback' ? 'Feedback' : 'Bug report'} accepted: ${(r.title as string) || reportId}` +
        (isFirstCredit ? ' (backfill)' : ` (backfill delta credit: ${creditedAmount} -> ${bonusPoints})`),
      type: rewardType,
    });

    if (result.success) {
      credited++;
      const patch: Record<string, unknown> = { rewardStatus: 'rewarded', rewardType, creditedAmount: bonusPoints };
      if (!isFirstCredit) patch.deltaSeq = deltaSeq + 1;
      try {
        await setReportAttributes(reportId, patch);
        console.log(`[bug-report][backfill] credited ${reportId} +${delta}pt`);
      } catch (err) {
        console.warn(`[bug-report][backfill] bookkeeping update failed ${reportId}:`, err instanceof Error ? err.message : err);
      }
    } else {
      failed++;
      console.warn(`[bug-report][backfill] failed ${reportId}: ${result.error}`);
    }
  }

  console.log(`[bug-report][backfill] done: attempted=${attempted} credited=${credited} skipped=${skipped} failed=${failed}`);
}

export async function runPrune(): Promise<void> {
  try {
    const activeKeys = await listActiveScreenshotKeys();
    const deleted = await pruneScreenshots(activeKeys);
    console.log(`[bug-report][prune] active=${activeKeys.size} deleted=${deleted}`);
  } catch (err) {
    console.error('[bug-report][prune] failed:', err instanceof Error ? err.message : err);
  }
}
