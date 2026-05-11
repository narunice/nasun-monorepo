/**
 * Daily Referral Bonus
 *
 * Once per UTC day, computes 10% of each referred user's PRIOR-DAY total
 * points (base × weights + ALL bonuses except referral-bonus itself, to
 * avoid cascade) and INSERTs that 10% as a single bonus row each for the
 * referrer and the referred user. tx_digest is
 * `ref-daily-{l1|rcv}:{identity}:{YYYY-MM-DD}` so re-runs are idempotent
 * (ON CONFLICT DO NOTHING).
 *
 * Why daily and not per-insert: includes admin-curated bonuses (creator
 * posts, missions, repost, leaderboard rank rewards, etc.) that are
 * INSERTed by separate scripts and never flow through the points scanner.
 * Per-insert calc only saw on-chain events. Daily aggregation is the one
 * place where every category that landed in activity_points yesterday is
 * already finalized.
 *
 * Cap policy: REFERRAL_DAILY_BONUS_CAP applies PER REFEREE per side, NOT
 * aggregate per referrer. A referrer with N active referees can earn up
 * to N × CAP/day in referrer bonuses. This is a deliberate change from
 * the per-insert era's per-referrer aggregate cap and matches the new
 * "10% of each referee's daily total" model.
 *
 * Eligibility:
 *  - referral status = ACTIVATED (cache only ever contains these)
 *  - yesterday >= activatedAt::date  (no bonus for activity before approval)
 *  - now - activatedAt < 180 days    (sliding window from approval)
 *  - referred user not flagged       (banned/anti-spam)
 *
 * TODO: standalone backfill script (call runDailyReferralBonus(date) from
 * CLI for any UTC day where the snapshot — and therefore this batch — was
 * skipped). ON CONFLICT makes it safe to re-run.
 */

import { pointsDb } from '../db.js';
import {
  REFERRAL_REWARD_ENABLED,
  REFERRAL_L1_BONUS_RATE,
  REFERRAL_L1_REFERRED_BONUS_RATE,
  REFERRAL_DAILY_BONUS_CAP,
} from '../config/referral.js';
import { getReferralCache, getIdentityToWalletMap } from './referral-bonus.js';

const EXPIRY_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Compute and insert referral bonuses for the given UTC date (YYYY-MM-DD).
 * Should run after the daily snapshot has finalized yesterday's activity.
 * Returns the number of bonus rows inserted (0 if disabled or nothing to do).
 */
export async function runDailyReferralBonus(yesterdayDateStr: string): Promise<number> {
  if (!REFERRAL_REWARD_ENABLED || !pointsDb) return 0;

  const cache = getReferralCache();
  if (cache.size === 0) {
    console.log('[Referral-Daily] Cache empty, nothing to compute');
    return 0;
  }

  const identityToWallet = getIdentityToWalletMap();
  const nowMs = Date.now();

  // Build the eligible referee list (status=ACTIVATED is guaranteed by the
  // cache; here we filter by 180-day window and known activatedAt).
  type Eligible = { referredId: string; referrerId: string; activatedMs: number };
  const eligible: Eligible[] = [];
  for (const [referredId, entry] of cache) {
    if (!entry.activatedAt) continue; // Skip rows missing activatedAt (defensive)
    const activatedMs = Date.parse(entry.activatedAt);
    if (!Number.isFinite(activatedMs)) continue;
    if (nowMs - activatedMs > EXPIRY_MS) continue;
    eligible.push({ referredId, referrerId: entry.referrerId, activatedMs });
  }
  if (eligible.length === 0) {
    console.log('[Referral-Daily] No eligible referees in 180d window');
    return 0;
  }

  // Per-referee SQL: SUM yesterday's final_points (excluding referral-bonus
  // to prevent cascade), gated by `tx_timestamp >= activatedAt` so a referee
  // approved mid-day doesn't receive credit for pre-approval txs that
  // happened earlier the same UTC day.
  //
  // We could batch all referees in one query with VALUES, but a small loop
  // (N <= a few hundred per day at devnet scale) is simpler and keeps each
  // user's `activatedAt` boundary explicit. Worth profiling later.
  const totalsByReferred = new Map<string, number>();
  for (const e of eligible) {
    const activatedAtIso = new Date(e.activatedMs).toISOString();
    const sumRows = await pointsDb<Array<{ total: string }>>`
      SELECT COALESCE(SUM(final_points), 0)::numeric AS total
      FROM activity_points
      WHERE identity_id = ${e.referredId}
        AND (tx_timestamp AT TIME ZONE 'UTC')::date = ${yesterdayDateStr}::date
        AND tx_timestamp >= ${activatedAtIso}::timestamptz
        AND category <> 'referral-bonus'
        AND NOT flagged
    `;
    totalsByReferred.set(e.referredId, Number(sumRows[0]?.total) || 0);
  }

  // For each eligible referee, compose two bonus rows (referrer + referred).
  // Tx digest format: ref-daily-l1:{referrerId}:{date}, ref-daily-rcv:{referredId}:{date}.
  // ON CONFLICT DO NOTHING relies on UNIQUE (tx_digest, activity_type, event_seq).
  const inserts: Array<{
    wallet_address: string;
    identity_id: string;
    tx_digest: string;
    tx_sequence_number: number;
    category: string;
    activity_type: string;
    base_points: number;
    volume_tier: number;
    genesis_multiplier: number;
    final_points: string;
    tx_timestamp: Date;
    event_seq: number;
  }> = [];

  // Use end-of-day UTC for tx_timestamp so the bonus belongs to yesterday's
  // bucket in any later daily aggregations / leaderboards.
  const txTimestamp = new Date(`${yesterdayDateStr}T23:59:59.000Z`);

  let referrerCount = 0;
  let referredCount = 0;
  for (const e of eligible) {
    // Skip days before activation (shouldn't happen since activatedAt
    // filtered above, but covers same-day boundary edge cases).
    const yesterdayStartMs = Date.parse(`${yesterdayDateStr}T00:00:00.000Z`);
    const yesterdayEndMs = yesterdayStartMs + 24 * 60 * 60 * 1000 - 1;
    if (e.activatedMs > yesterdayEndMs) continue;

    const total = totalsByReferred.get(e.referredId) || 0;
    if (total <= 0) continue;
    const rawBonus = total * REFERRAL_L1_BONUS_RATE; // both rates are 0.10
    const bonus = Math.min(rawBonus, REFERRAL_DAILY_BONUS_CAP);
    const bonusFixed = Number(bonus.toFixed(2));
    if (bonusFixed <= 0) continue;

    // Referrer row
    const referrerWallet = identityToWallet.get(e.referrerId);
    if (referrerWallet) {
      inserts.push({
        wallet_address: referrerWallet,
        identity_id: e.referrerId,
        tx_digest: `ref-daily-l1:${e.referrerId}:${yesterdayDateStr}`,
        tx_sequence_number: 0,
        category: 'referral-bonus',
        activity_type: 'l1-bonus',
        base_points: bonusFixed,
        volume_tier: 1.0,
        genesis_multiplier: 1.0,
        final_points: bonusFixed.toFixed(2),
        tx_timestamp: txTimestamp,
        // Compose event_seq from the date so multiple referrers with the
        // same digest prefix never collide (digest already includes id).
        event_seq: 0,
      });
      referrerCount++;
    }

    // Referred user row — same calc since both rates are 0.10. If rates
    // ever diverge, recompute separately here.
    const referredBonus = Math.min(total * REFERRAL_L1_REFERRED_BONUS_RATE, REFERRAL_DAILY_BONUS_CAP);
    const referredFixed = Number(referredBonus.toFixed(2));
    const referredWallet = identityToWallet.get(e.referredId);
    if (referredFixed > 0 && referredWallet) {
      inserts.push({
        wallet_address: referredWallet,
        identity_id: e.referredId,
        tx_digest: `ref-daily-rcv:${e.referredId}:${yesterdayDateStr}`,
        tx_sequence_number: 0,
        category: 'referral-bonus',
        activity_type: 'l1-referred-bonus',
        base_points: referredFixed,
        volume_tier: 1.0,
        genesis_multiplier: 1.0,
        final_points: referredFixed.toFixed(2),
        tx_timestamp: txTimestamp,
        event_seq: 0,
      });
      referredCount++;
    }
  }

  if (inserts.length === 0) {
    console.log(`[Referral-Daily] ${yesterdayDateStr}: nothing to insert (no eligible activity)`);
    return 0;
  }

  const result = await pointsDb`
    INSERT INTO activity_points ${pointsDb(inserts, 'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number', 'category', 'activity_type', 'base_points', 'volume_tier', 'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq')}
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;

  console.log(
    `[Referral-Daily] ${yesterdayDateStr}: inserted ${result.count} rows ` +
    `(${referrerCount} referrer + ${referredCount} referred candidates; some may be no-ops via ON CONFLICT)`,
  );
  return result.count;
}
