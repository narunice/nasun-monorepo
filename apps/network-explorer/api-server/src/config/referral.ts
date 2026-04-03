// Referral bonus configuration
// Changes here are forward-only: existing bonus records are never recalculated.

import { safeFloat } from './ecosystem.js';

export const REFERRAL_REWARD_ENABLED =
  process.env.REFERRAL_REWARD_ENABLED === 'true';

// Bonus rate: 10% of referred user's base_points (paid to referrer)
export const REFERRAL_L1_BONUS_RATE = 0.1;

// Bonus rate: 5% extra on referred user's own base_points (paid to referred user)
export const REFERRAL_L1_REFERRED_BONUS_RATE = 0.05;

// Max bonus points per day (applies independently to referrer and referred user)
export const REFERRAL_DAILY_BONUS_CAP = 50;

// Referral bonus expiry: ~6 months (180 days) from appliedAt
export const REFERRAL_EXPIRY_DAYS = 180;
export const REFERRAL_EXPIRY_MS = REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Max referrals per user (enforced at Lambda level, used here for sanity check)
export const REFERRAL_MAX_PER_USER = 100;

// Referral cache refresh interval (same as wallet cache)
export const REFERRAL_CACHE_REFRESH_MS = 3 * 60 * 60 * 1000; // 3 hours

// Scaling factor for referral bonus contribution to ecosystem score.
// Referral bonuses are added as a separate term: ecosystemScore += referralTotal * factor.
// 1.0 = full contribution, 0.5 = half, 0 = excluded from ecosystem score.
export const REFERRAL_ECOSYSTEM_SCALING_FACTOR =
  safeFloat(process.env.REFERRAL_ECOSYSTEM_SCALING, 0.5);
