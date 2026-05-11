/**
 * Referral Bonus Calculator
 *
 * Runs after each processBatch() in the points scanner.
 * Calculates referral bonuses for referrers (10%) and referred users (5%)
 * based on the referred users' on-chain activities.
 *
 * Design:
 * - Fetches referral mappings from Lambda (HTTP, same pattern as wallet cache)
 * - Referrer bonus  = base_points * REFERRAL_L1_BONUS_RATE (10%)
 * - Referred bonus   = base_points * REFERRAL_L1_REFERRED_BONUS_RATE (5%)
 * - Daily cap per user per bonus type (REFERRAL_DAILY_BONUS_CAP)
 * - Expiry filtering handled at Lambda level (180 days from appliedAt)
 * - Fully isolated: errors here never affect the main scan loop
 * - tx_digest format:
 *     referrer:  ref:{referrerIdentityId}:{original_digest}:{event_seq}
 *     referred:  ref-rcv:{referredIdentityId}:{original_digest}:{event_seq}
 */

import {
  REFERRAL_REWARD_ENABLED,
  REFERRAL_CACHE_REFRESH_MS,
} from '../config/referral.js';
import { saveCache, loadCache } from './cache-persist.js';
import { fetchWithOffload } from './fetch-with-offload.js';

// Referral cache shape v2: referredIdentityId -> { referrerId, activatedAt }
// activatedAt enables filtering out txs that predate admin approval
// (manual-review model: bonus only counts for activity AFTER admin approves).
const REFERRAL_CACHE_VERSION = 2;
interface ReferralEntry {
  referrerId: string;
  activatedAt: string | null; // ISO8601; null tolerated for legacy ACTIVATED rows
}
let referralCache = new Map<string, ReferralEntry>();
let referralCacheLastRefresh = 0;

// Reverse wallet map: identityId -> walletAddress (built from registeredWallets)
let identityToWallet = new Map<string, string>();

export function getIdentityToWalletMap(): Map<string, string> {
  return identityToWallet;
}

/**
 * Expose the in-memory referral cache (referredId -> {referrerId, activatedAt}).
 * Consumed by daily-referral-bonus.ts so it can iterate ACTIVATED referees
 * without a second DDB fetch.
 */
export function getReferralCache(): Map<string, ReferralEntry> {
  return referralCache;
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
    const data = await fetchWithOffload<MappingsPayload>({
      url,
      apiKey,
      label: 'Referral',
    });

    if (!data) {
      loadFromDiskFallback();
      referralCacheLastRefresh = now;
      return;
    }

    // V1-only fresh response means the server is rolled back to pre-V2.
    // Bypassing the activatedAt gate would silently re-enable bonuses for
    // pre-approval activity — refuse and keep prior cache.
    if (!data.referralsV2 && data.referrals) {
      console.error(
        '[Referral] Fresh response is V1-only (no referralsV2); refusing to apply (would bypass activatedAt gate). Keeping prior cache.',
      );
      referralCacheLastRefresh = now;
      return;
    }

    applyReferralPayload(data);
    saveCache('referral-mappings', { ...data, version: REFERRAL_CACHE_VERSION });

    referralCacheLastRefresh = now;
    console.log(
      `[Referral] Cache refreshed: ${referralCache.size} relationships`,
    );
  } catch (err) {
    console.error('[Referral] Cache refresh error:', err);
    if (referralCache.size === 0) {
      loadFromDiskFallback();
    }
    referralCacheLastRefresh = now;
  }
}

interface MappingsPayload {
  version?: number;
  referrals?: Record<string, string>;
  referralsV2?: Record<string, { referrerId: string; activatedAt: string | null }>;
}

function loadFromDiskFallback(): void {
  if (referralCache.size > 0) return;
  const fallback = loadCache<MappingsPayload>('referral-mappings');
  if (!fallback) return;
  // Version gate: ignore caches saved before V2 introduction. Legacy disk
  // caches lack activatedAt and would silently allow pre-approval bonuses.
  if (fallback.version !== REFERRAL_CACHE_VERSION) {
    console.warn(
      `[Referral] Disk cache version ${fallback.version ?? 'unknown'} != ${REFERRAL_CACHE_VERSION}, ignoring`,
    );
    return;
  }
  applyReferralPayload(fallback);
  if (referralCache.size > 0) {
    console.warn(`[Referral] Loaded from disk fallback: ${referralCache.size} relationships`);
  }
}

function applyReferralPayload(data: MappingsPayload): void {
  // Prefer V2 (carries activatedAt). Fall back to legacy shape only if V2 absent;
  // legacy entries get activatedAt=null which the bonus loop tolerates as
  // "always eligible" for back-compat with pre-manual-review records.
  const newMap = new Map<string, ReferralEntry>();
  if (data.referralsV2 && typeof data.referralsV2 === 'object') {
    for (const [referredId, entry] of Object.entries(data.referralsV2)) {
      if (typeof referredId !== 'string' || !entry || typeof entry !== 'object') continue;
      if (typeof entry.referrerId !== 'string') continue;
      newMap.set(referredId, {
        referrerId: entry.referrerId,
        activatedAt: typeof entry.activatedAt === 'string' ? entry.activatedAt : null,
      });
    }
  } else if (data.referrals && typeof data.referrals === 'object') {
    for (const [referredId, referrerId] of Object.entries(data.referrals)) {
      if (typeof referredId === 'string' && typeof referrerId === 'string') {
        newMap.set(referredId, { referrerId, activatedAt: null });
      }
    }
  }
  referralCache = newMap;
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

// NOTE: per-batch real-time referral bonus calc removed. Bonuses are now
// computed once per UTC day by daily-referral-bonus.ts so they include
// admin-curated grants (creator posts, missions, repost, leaderboard rank
// rewards, etc.) that bypass the points scanner. The legacy
// `calculateReferralBonuses` and `warmUpDailyBonusAccumulator` exports were
// deleted; their callers (points-scanner.ts) must be updated to invoke
// `runDailyReferralBonus` from daily-referral-bonus.ts after the daily
// snapshot completes.
