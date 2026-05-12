/**
 * Backfill Lambda for stuck bug-report rewards.
 *
 * Why this exists:
 *   The admin PATCH path credits points by calling Explorer API with a 3-attempt
 *   exponential retry. If all attempts fail (e.g. Explorer 429, network blip),
 *   the report row stays at rewardStatus='pending' forever -- no automatic
 *   recovery. This Lambda runs on a schedule and retries every pending row.
 *
 * Also catches:
 *   - status terminal + bonusPoints > 0 + rewardStatus = null
 *     (admin set status and bonusPoints in separate PATCH calls; the new admin
 *      code prevents this going forward, but historical rows still need a fix)
 *
 * Idempotency: relies on activity_points UNIQUE(tx_digest, activity_type,
 * event_seq) + creditedAmount tracking in DDB. Safe to run as often as the
 * EventBridge schedule fires.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BUG_REPORTS_TABLE = process.env.BUG_REPORTS_TABLE || 'nasun-bug-reports';
const EXPLORER_API_URL = process.env.EXPLORER_API_URL || '';
const BUG_REPORT_API_KEY = process.env.BUG_REPORT_API_KEY || '';

const REWARD_TRIGGER_STATUSES = new Set(['fixed', 'accepted']);
const FEEDBACK_CATEGORIES = new Set(['Feedback', 'Feature Request']);

interface Candidate {
  reportId: string;
  timestamp: string;
  walletAddress?: string;
  identityId: string;
  category: string;
  title?: string;
  bonusPoints: number;
  creditedAmount: number;
  deltaSeq: number;
  rewardStatus: string | null;
}

async function findCandidates(): Promise<Candidate[]> {
  const rows: Candidate[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const out = await ddbClient.send(new ScanCommand({
      TableName: BUG_REPORTS_TABLE,
      FilterExpression:
        '(#s = :s1 OR #s = :s2) AND bonusPoints > :z ' +
        'AND (attribute_not_exists(rewardStatus) OR rewardStatus = :p1 OR rewardStatus = :p2)',
      ExpressionAttributeNames: { '#s': 'status', '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':s1': 'fixed',
        ':s2': 'accepted',
        ':z': 0,
        ':p1': 'pending',
        ':p2': 'pending-no-wallet',
      },
      ProjectionExpression: 'reportId, #ts, walletAddress, identityId, category, title, bonusPoints, creditedAmount, deltaSeq, rewardStatus',
      ExclusiveStartKey: lastKey,
    }));
    for (const it of out.Items || []) {
      rows.push({
        reportId: it.reportId as string,
        timestamp: it.timestamp as string,
        walletAddress: it.walletAddress as string | undefined,
        identityId: it.identityId as string,
        category: it.category as string,
        title: it.title as string | undefined,
        bonusPoints: (it.bonusPoints as number) || 0,
        creditedAmount: (it.creditedAmount as number) || 0,
        deltaSeq: (it.deltaSeq as number) || 0,
        rewardStatus: (it.rewardStatus as string | null) ?? null,
      });
    }
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

async function sendRewardToExplorer(payload: {
  walletAddress: string;
  identityId: string;
  reportId: string;
  points: number;
  reason: string;
  type: 'feedback' | 'bug-report';
}): Promise<{ success: boolean; created?: boolean; finalPoints?: number; error?: string }> {
  if (!EXPLORER_API_URL || !BUG_REPORT_API_KEY) {
    return { success: false, error: 'Points reward not configured' };
  }
  const url = `${EXPLORER_API_URL}/api/v1/points/bug-report-reward`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': BUG_REPORT_API_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        return (await res.json()) as { success: boolean; created?: boolean; finalPoints?: number };
      }
      const errBody = await res.text();
      console.warn(`[backfill] explorer ${res.status}: ${errBody.slice(0, 200)}`);
    } catch (err) {
      console.warn(`[backfill] fetch failed (attempt ${attempt + 1}):`, err);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  return { success: false, error: 'Failed to send reward after retries' };
}

export const handler = async () => {
  const candidates = await findCandidates();
  console.log(`[backfill] candidates=${candidates.length}`);

  let attempted = 0;
  let credited = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of candidates) {
    if (!r.walletAddress) { skipped++; continue; }
    if (r.creditedAmount >= r.bonusPoints) { skipped++; continue; }
    attempted++;

    const delta = r.bonusPoints - r.creditedAmount;
    const isFirstCredit = r.creditedAmount === 0;
    const deltaSuffix = isFirstCredit ? '' : `-delta-${r.deltaSeq + 1}`;
    const rewardType: 'feedback' | 'bug-report' =
      FEEDBACK_CATEGORIES.has(r.category) ? 'feedback' : 'bug-report';

    const result = await sendRewardToExplorer({
      walletAddress: r.walletAddress,
      identityId: r.identityId,
      reportId: r.reportId + deltaSuffix,
      points: delta,
      reason:
        `${rewardType === 'feedback' ? 'Feedback' : 'Bug report'} accepted: ${r.title || r.reportId}` +
        (isFirstCredit ? ' (backfill)' : ` (backfill delta credit: ${r.creditedAmount} -> ${r.bonusPoints})`),
      type: rewardType,
    });

    if (result.success) {
      credited++;
      const updateExpr = isFirstCredit
        ? 'SET rewardStatus = :rs, rewardType = :rt, creditedAmount = :ca'
        : 'SET rewardStatus = :rs, rewardType = :rt, creditedAmount = :ca, deltaSeq = :ds';
      const exprValues: Record<string, unknown> = {
        ':rs': 'rewarded',
        ':rt': rewardType,
        ':ca': r.bonusPoints,
      };
      if (!isFirstCredit) exprValues[':ds'] = r.deltaSeq + 1;
      await ddbClient.send(new UpdateCommand({
        TableName: BUG_REPORTS_TABLE,
        Key: { reportId: r.reportId, timestamp: r.timestamp },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprValues,
      }));
      console.log(`[backfill] credited ${r.reportId} +${delta}pt`);
    } else {
      failed++;
      console.warn(`[backfill] failed ${r.reportId}: ${result.error}`);
    }
  }

  console.log(`[backfill] done: attempted=${attempted} credited=${credited} skipped=${skipped} failed=${failed}`);
  return { attempted, credited, skipped, failed };
};
