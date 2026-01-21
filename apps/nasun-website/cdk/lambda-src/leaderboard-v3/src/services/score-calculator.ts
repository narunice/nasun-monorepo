/**
 * Score Calculator for Leaderboard V3
 *
 * Implements the scoring formulas from LEADERBOARD_V3_SPEC.md
 *
 * PostScore = Base × RoleMultiplier + SignalBonus
 * RawScore = Σ(PostScore) × log₂(PostCount + 1) / PostCount
 * ConsistencyBonus = 1 + log₂(UniqueActiveDays + 1) × 0.1 (max 1.5)
 * FreshnessMultiplier = 1 / (1 + DaysSinceLastPost / 14)
 * UserScore = RawScore × ConsistencyBonus × FreshnessMultiplier
 */

import {
  Account,
  AccountRole,
  ComputedUserScore,
  ContentSignal,
  ROLE_MULTIPLIERS,
  SCORE_CONSTANTS,
  SIGNAL_BONUSES,
} from '../types';

/**
 * Calculate the score for a single post
 *
 * Formula: PostScore = Base × RoleMultiplier + SignalBonus
 * Range: 1.0 (Default + Standard) to 5.0 (KOL + all signals)
 */
export function calculatePostScore(
  role: AccountRole,
  signals: ContentSignal[]
): {
  baseScore: number;
  roleMultiplier: number;
  signalBonus: number;
  postScore: number;
} {
  const baseScore = SCORE_CONSTANTS.BASE_SCORE;
  const roleMultiplier = ROLE_MULTIPLIERS[role];

  // Calculate signal bonus (sum of all non-standard signals)
  const signalBonus = signals.reduce((sum, signal) => {
    return sum + SIGNAL_BONUSES[signal];
  }, 0);

  // PostScore = Base × RoleMultiplier + SignalBonus
  const postScore = baseScore * roleMultiplier + signalBonus;

  return {
    baseScore,
    roleMultiplier,
    signalBonus,
    postScore: Math.min(postScore, SCORE_CONSTANTS.POST_SCORE_MAX),
  };
}

/**
 * Calculate effective posts using log decay
 *
 * Formula: EffectivePosts = log₂(PostCount + 1)
 *
 * This creates diminishing returns:
 * - 1 post = 1.00 effective
 * - 4 posts = 2.32 effective
 * - 8 posts = 3.17 effective
 * - 16 posts = 4.09 effective
 */
export function calculateEffectivePosts(postCount: number): number {
  if (postCount <= 0) return 0;
  return Math.log2(postCount + 1);
}

/**
 * Calculate raw score with log decay applied
 *
 * Formula: RawScore = Σ(PostScore) × log₂(PostCount + 1) / PostCount
 *
 * This means the effective multiplier is: log₂(PostCount + 1) / PostCount
 * - 1 post: 1.00 (100% efficiency)
 * - 2 posts: 0.79 (79% efficiency)
 * - 4 posts: 0.58 (58% efficiency)
 * - 8 posts: 0.40 (40% efficiency)
 */
export function calculateRawScore(
  totalPostScore: number,
  postCount: number
): number {
  if (postCount <= 0 || totalPostScore <= 0) return 0;

  const effectivePosts = calculateEffectivePosts(postCount);
  // RawScore = totalPostScore × (effectivePosts / postCount)
  return totalPostScore * (effectivePosts / postCount);
}

/**
 * Calculate consistency bonus based on unique active days
 *
 * Formula: ConsistencyBonus = 1 + log₂(UniqueActiveDays + 1) × 0.1
 * Capped at 1.5 (approximately 30 days)
 *
 * - 1 day: 1.10
 * - 3 days: 1.20
 * - 7 days: 1.30
 * - 14 days: 1.40
 * - 30+ days: 1.50 (cap)
 */
export function calculateConsistencyBonus(uniqueActiveDays: number): number {
  if (uniqueActiveDays <= 0) return 1.0;

  const bonus =
    1 + Math.log2(uniqueActiveDays + 1) * SCORE_CONSTANTS.CONSISTENCY_BONUS_MULTIPLIER;

  return Math.min(bonus, SCORE_CONSTANTS.CONSISTENCY_BONUS_MAX);
}

/**
 * Calculate freshness multiplier based on days since last activity
 *
 * Formula: FreshnessMultiplier = 1 / (1 + DaysSinceLastPost / 14)
 *
 * This creates a gentle decay:
 * - Today: 1.00
 * - 7 days ago: 0.67
 * - 14 days ago: 0.50
 * - 30 days ago: 0.32
 * - 60 days ago: 0.19
 */
export function calculateFreshnessMultiplier(lastSeenAt: string): number {
  const lastSeenDate = new Date(lastSeenAt);
  const now = new Date();

  // Calculate days since last activity
  const daysSinceLastPost = Math.max(
    0,
    Math.floor((now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // FreshnessMultiplier = 1 / (1 + daysSinceLastPost / halfLife)
  return 1 / (1 + daysSinceLastPost / SCORE_CONSTANTS.FRESHNESS_HALF_LIFE_DAYS);
}

/**
 * Calculate the complete user score from an Account record
 *
 * This is the main function used during leaderboard generation.
 * It calculates scores at read-time to ensure freshness is always current.
 *
 * Formula: UserScore = RawScore × ConsistencyBonus × FreshnessMultiplier
 */
export function calculateUserScore(account: Account): ComputedUserScore {
  // Calculate each component
  const effectivePosts = calculateEffectivePosts(account.postCount);
  const rawScore = calculateRawScore(account.totalPostScore, account.postCount);
  const consistencyBonus = calculateConsistencyBonus(account.uniqueActiveDays);
  const freshnessMultiplier = calculateFreshnessMultiplier(account.lastSeenAt);

  // Final UserScore
  const userScore = rawScore * consistencyBonus * freshnessMultiplier;

  return {
    accountId: account.accountId,
    username: account.username,
    platform: account.platform,
    displayName: account.displayName,
    profileImageUrl: account.profileImageUrl,
    isRegistered: account.isRegistered,
    totalPostScore: account.totalPostScore,
    postCount: account.postCount,
    signalCountTotal: account.signalCountTotal,
    uniqueActiveDays: account.uniqueActiveDays,
    lastSeenAt: account.lastSeenAt,
    effectivePosts,
    rawScore,
    consistencyBonus,
    freshnessMultiplier,
    userScore,
  };
}

/**
 * Compare two computed scores for sorting (descending by score)
 *
 * Tie-break priority:
 * 1. UserScore (total score)
 * 2. EffectivePosts = log₂(postCount + 1)
 * 3. SignalCountTotal (quality signals count)
 * 4. UniqueActiveDays (consistency)
 * 5. LastActivityTimestamp (most recent first)
 */
export function compareScores(a: ComputedUserScore, b: ComputedUserScore): number {
  // 1. Primary: UserScore (descending)
  if (a.userScore !== b.userScore) {
    return b.userScore - a.userScore;
  }

  // 2. Tie-break: EffectivePosts (descending)
  if (a.effectivePosts !== b.effectivePosts) {
    return b.effectivePosts - a.effectivePosts;
  }

  // 3. Tie-break: SignalCountTotal (descending)
  if (a.signalCountTotal !== b.signalCountTotal) {
    return b.signalCountTotal - a.signalCountTotal;
  }

  // 4. Tie-break: UniqueActiveDays (descending)
  if (a.uniqueActiveDays !== b.uniqueActiveDays) {
    return b.uniqueActiveDays - a.uniqueActiveDays;
  }

  // 5. Final tie-break: LastActivityTimestamp (most recent first)
  return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
}

/**
 * Count bonus signals in a ContentSignal array
 * (excludes 'standard' which gives +0)
 */
export function countBonusSignals(signals: ContentSignal[]): number {
  return signals.filter((s) => s !== 'standard').length;
}

/**
 * Get today's date as YYYY-MM-DD string
 */
export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Add a date to the active dates array if not already present
 * Returns the updated array and whether it was a new day
 */
export function addActiveDate(
  existingDates: string[],
  newDate: string
): { dates: string[]; isNewDay: boolean } {
  const dateStr = newDate.split('T')[0]; // Ensure YYYY-MM-DD format

  if (existingDates.includes(dateStr)) {
    return { dates: existingDates, isNewDay: false };
  }

  return {
    dates: [...existingDates, dateStr].sort(),
    isNewDay: true,
  };
}
