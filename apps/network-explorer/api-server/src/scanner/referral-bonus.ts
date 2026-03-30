/**
 * Referral Bonus Calculator
 *
 * Runs after each processBatch() in the points scanner.
 * Calculates referral bonuses for referrers based on their referrals' activities.
 *
 * Design:
 * - Fetches referral mappings from Lambda (HTTP, same pattern as wallet cache)
 * - Calculates bonus = base_points * REFERRAL_L1_BONUS_RATE
 * - Daily cap per referrer (REFERRAL_DAILY_BONUS_CAP)
 * - Fully isolated: errors here never affect the main scan loop
 * - tx_digest format: ref:{referrerIdentityId}:{original_digest}:{event_seq}
 */

import { pointsDb } from '../db.js';
import {
  REFERRAL_REWARD_ENABLED,
  REFERRAL_L1_BONUS_RATE,
  REFERRAL_DAILY_BONUS_CAP,
  REFERRAL_CACHE_REFRESH_MS,
} from '../config/referral.js';

// Referral cache: referredIdentityId -> referrerIdentityId
let referralCache = new Map<string, string>();
let referralCacheLastRefresh = 0;

// Daily bonus accumulator: referrerIdentityId -> today's total bonus points
let dailyBonusAccumulator = new Map<string, number>();
let dailyBonusDate = '';

// Reverse wallet map: identityId -> walletAddress (built from registeredWallets)
let identityToWallet = new Map<string, string>();

export function getIdentityToWalletMap(): Map<string, string> {
  return identityToWallet;
}

// Types matching points-scanner inserts
export interface PointsInsert {
  wallet_address: string;
  identity_id: string | null;
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
}

/**
 * Refresh referral mappings from Lambda (HTTP fetch, same pattern as wallet cache).
 * Call from scanLoop after maybeRefreshWalletCache.
 */
export async function maybeRefreshReferralCache(): Promise<void> {
  if (!REFERRAL_REWARD_ENABLED) return;

  const now = Date.now();
  if (now - referralCacheLastRefresh < REFERRAL_CACHE_REFRESH_MS) return;

  const url = process.env.REFERRAL_MAPPINGS_URL;
  const apiKey = process.env.REFERRAL_MAPPINGS_API_KEY;

  if (!url) {
    if (referralCache.size === 0) {
      console.warn('[Referral] REFERRAL_MAPPINGS_URL not set, bonus disabled');
    }
    referralCacheLastRefresh = now;
    return;
  }

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(
        `[Referral] Cache refresh failed: ${res.status} ${res.statusText}`,
      );
      referralCacheLastRefresh = now;
      return;
    }

    const data = await res.json();

    if (data.referrals && typeof data.referrals === 'object') {
      const newMap = new Map<string, string>();
      for (const [referredId, referrerId] of Object.entries(data.referrals)) {
        if (typeof referredId === 'string' && typeof referrerId === 'string') {
          newMap.set(referredId, referrerId);
        }
      }
      referralCache = newMap;
    }

    referralCacheLastRefresh = now;
    console.log(
      `[Referral] Cache refreshed: ${referralCache.size} relationships`,
    );
  } catch (err) {
    console.error('[Referral] Cache refresh error:', err);
    referralCacheLastRefresh = now;
  }
}

/**
 * Build reverse wallet map from the scanner's registeredWallets.
 * Must be called after wallet cache refresh.
 */
export function updateIdentityToWalletMap(
  registeredWallets: Map<string, string>,
): void {
  const newMap = new Map<string, string>();
  for (const [addr, id] of registeredWallets) {
    // First wallet wins (in case of multiple wallets per identity)
    if (!newMap.has(id)) {
      newMap.set(id, addr);
    }
  }
  identityToWallet = newMap;
}

/**
 * Warm up daily bonus accumulator on PM2 restart.
 * Queries today's total referral-bonus points per referrer.
 */
export async function warmUpDailyBonusAccumulator(): Promise<void> {
  if (!pointsDb || !REFERRAL_REWARD_ENABLED) return;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  dailyBonusDate = today;

  try {
    const rows = await pointsDb`
      SELECT identity_id, SUM(final_points)::numeric as total
      FROM activity_points
      WHERE category = 'referral-bonus'
        AND processed_at >= ${today}::date
        AND processed_at < (${today}::date + interval '1 day')
      GROUP BY identity_id
    `;

    dailyBonusAccumulator = new Map();
    for (const row of rows) {
      if (row.identity_id) {
        dailyBonusAccumulator.set(row.identity_id, Number(row.total));
      }
    }

    console.log(
      `[Referral] Daily bonus warm-up: ${dailyBonusAccumulator.size} referrers active today`,
    );
  } catch (err) {
    console.error('[Referral] Daily bonus warm-up error:', err);
  }
}

/**
 * Calculate and insert referral bonuses for a batch of activity_points inserts.
 * Called after each processBatch() in the main scanner loop.
 *
 * IMPORTANT: This function is wrapped in try-catch by the caller.
 * It must never throw unhandled exceptions that could crash the scanner.
 */
export async function calculateReferralBonuses(
  inserts: PointsInsert[],
): Promise<number> {
  if (!REFERRAL_REWARD_ENABLED || !pointsDb || referralCache.size === 0) {
    return 0;
  }

  // Reset daily accumulator if date changed
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyBonusDate) {
    dailyBonusAccumulator = new Map();
    dailyBonusDate = today;
  }

  const bonusInserts: {
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
  }[] = [];

  for (const insert of inserts) {
    // Skip if the insert itself is a referral-bonus (no cascading)
    if (insert.category === 'referral-bonus') continue;

    // Check if this user was referred
    const referredId = insert.identity_id;
    if (!referredId) continue;

    const referrerId = referralCache.get(referredId);
    if (!referrerId) continue;

    // Calculate bonus from base_points (before genesis multiplier)
    const bonus = insert.base_points * REFERRAL_L1_BONUS_RATE;
    if (bonus <= 0) continue;

    // Check daily cap
    const currentDaily = dailyBonusAccumulator.get(referrerId) || 0;
    if (currentDaily >= REFERRAL_DAILY_BONUS_CAP) continue;

    const cappedBonus = Math.min(bonus, REFERRAL_DAILY_BONUS_CAP - currentDaily);
    dailyBonusAccumulator.set(referrerId, currentDaily + cappedBonus);

    // Resolve referrer's wallet address
    const referrerWallet = identityToWallet.get(referrerId);
    if (!referrerWallet) continue;

    // Build unique tx_digest for idempotency
    const bonusDigest = `ref:${referrerId}:${insert.tx_digest}:${insert.event_seq}`;

    bonusInserts.push({
      wallet_address: referrerWallet,
      identity_id: referrerId,
      tx_digest: bonusDigest,
      tx_sequence_number: insert.tx_sequence_number,
      category: 'referral-bonus',
      activity_type: 'l1-bonus',
      base_points: Number(cappedBonus.toFixed(2)),
      volume_tier: 1.0,
      genesis_multiplier: 1.0, // Referral bonuses are not multiplied
      final_points: cappedBonus.toFixed(2),
      tx_timestamp: insert.tx_timestamp,
      event_seq: insert.event_seq,
    });
  }

  if (bonusInserts.length === 0) return 0;

  const result = await pointsDb`
    INSERT INTO activity_points ${pointsDb(bonusInserts, 'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number', 'category', 'activity_type', 'base_points', 'volume_tier', 'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq')}
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;

  if (result.count > 0) {
    console.log(`[Referral] ${result.count} bonus points recorded`);
  }

  return result.count;
}
