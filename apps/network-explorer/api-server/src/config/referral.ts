// Referral bonus configuration
// Changes here are forward-only: existing bonus records are never recalculated.

export const REFERRAL_REWARD_ENABLED =
  process.env.REFERRAL_REWARD_ENABLED === 'true';

// Bonus rate: 10% of referred user's base_points
export const REFERRAL_L1_BONUS_RATE = 0.1;

// Max bonus points a single referrer can earn per day
export const REFERRAL_DAILY_BONUS_CAP = 50;

// Max referrals per user (enforced at Lambda level, used here for sanity check)
export const REFERRAL_MAX_PER_USER = 100;

// Referral cache refresh interval (same as wallet cache)
export const REFERRAL_CACHE_REFRESH_MS = 3 * 60 * 60 * 1000; // 3 hours
