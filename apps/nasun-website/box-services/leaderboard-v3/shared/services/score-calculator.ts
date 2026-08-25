/**
 * Score Calculator for Leaderboard V3
 *
 * Implements the scoring formulas from LEADERBOARD_V3_SPEC.md
 *
 * PostScore = Base × PostTypeMultiplier × RoleMultiplier + SignalBonus
 *
 * RawScore (per-type calculation, Phase 9):
 *   OriginalRawScore = Σ(OriginalPostScore) × log₂(OriginalCount + 1) / OriginalCount
 *   QuoteRawScore = Σ(QuotePostScore) × log₂(QuoteCount + 1) / QuoteCount
 *   ReplyRawScore = Σ(ReplyPostScore) × log₂(ReplyCount + 1) / ReplyCount^0.7 (weaker decay)
 *   TotalRawScore = OriginalRawScore + QuoteRawScore + ReplyRawScore
 *
 * ConsistencyBonus = 1 + log₂(UniqueActiveDays + 1) × 0.1 (max 1.5)
 * FreshnessMultiplier = 1 / (1 + DaysSinceLastPost / 7) (7-day half-life)
 * CompressedRaw = RawScore ^ RAW_SCORE_EXPONENT (0.8, reduces top-rank gaps)
 * UserScore = CompressedRaw × ConsistencyBonus × FreshnessMultiplier
 */

import {
  Account,
  AccountLanguage,
  AccountRole,
  ComputedUserScore,
  ContentSignal,
  DAILY_BASE_SCORE_CAP,
  DAILY_BASE_SCORE_TIERS,
  FOLLOWER_THRESHOLDS,
  LANGUAGE_SCALE,
  PostType,
  POST_TYPE_MULTIPLIERS,
  ROLE_MULTIPLIERS,
  SCORE_CONSTANTS,
  SIGNAL_BONUSES,
} from '../types';

/**
 * Calculate the score for a single post
 *
 * Formula: PostScore = Base × PostTypeMultiplier × RoleMultiplier + SignalBonus
 * Range: 0.5 (reply + default + standard) to 5.0 (original/quote + KOL + all signals)
 */
export function calculatePostScore(
  role: AccountRole,
  signals: ContentSignal[],
  postType: PostType = 'original'
): {
  baseScore: number;
  postTypeMultiplier: number;
  roleMultiplier: number;
  signalBonus: number;
  postScore: number;
} {
  const baseScore = SCORE_CONSTANTS.BASE_SCORE;
  const postTypeMultiplier = POST_TYPE_MULTIPLIERS[postType];
  const roleMultiplier = ROLE_MULTIPLIERS[role];

  // Calculate signal bonus (sum of all non-standard signals)
  const signalBonus = signals.reduce((sum, signal) => {
    return sum + SIGNAL_BONUSES[signal];
  }, 0);

  // PostScore = Base × PostTypeMultiplier × RoleMultiplier + SignalBonus
  const postScore = baseScore * postTypeMultiplier * roleMultiplier + signalBonus;

  return {
    baseScore,
    postTypeMultiplier,
    roleMultiplier,
    signalBonus,
    postScore: Math.min(postScore, SCORE_CONSTANTS.POST_SCORE_MAX),
  };
}

/**
 * Calculate continuous role multiplier based on follower count and language
 *
 * Formula: RoleMultiplier = ROLE_MULTIPLIER_BASE + log₁₀(normalizedFollowers + 1) × ROLE_MULTIPLIER_LOG_FACTOR
 * Range: 0.3 (0 followers) to 4.0 (100,000+ normalized followers)
 */
export function calculateRoleMultiplier(
  followerCount: number,
  language: AccountLanguage = 'en'
): number {
  if (followerCount <= 0) {
    return SCORE_CONSTANTS.ROLE_MULTIPLIER_BASE;
  }

  const scale = LANGUAGE_SCALE[language] || LANGUAGE_SCALE.en;
  const normalizedFollowers = followerCount * scale;

  const multiplier =
    SCORE_CONSTANTS.ROLE_MULTIPLIER_BASE +
    Math.log10(normalizedFollowers + 1) * SCORE_CONSTANTS.ROLE_MULTIPLIER_LOG_FACTOR;

  return Math.min(multiplier, SCORE_CONSTANTS.ROLE_MULTIPLIER_MAX);
}

/**
 * Calculate post score using follower-based continuous multiplier
 *
 * Formula: PostScore = Base × PostTypeMultiplier × RoleMultiplier + SignalBonus
 * Range: 0.15 (reply + 0 followers + standard) to 7.0 (original/quote + max multiplier + all signals)
 */
export function calculatePostScoreWithFollowers(
  followerCount: number,
  language: AccountLanguage,
  signals: ContentSignal[],
  postType: PostType = 'original'
): {
  baseScore: number;
  postTypeMultiplier: number;
  roleMultiplier: number;
  signalBonus: number;
  postScore: number;
} {
  const baseScore = SCORE_CONSTANTS.BASE_SCORE;
  const postTypeMultiplier = POST_TYPE_MULTIPLIERS[postType];
  const roleMultiplier = calculateRoleMultiplier(followerCount, language);

  const signalBonus = signals.reduce((sum, signal) => {
    return sum + SIGNAL_BONUSES[signal];
  }, 0);

  // PostScore = Base × PostTypeMultiplier × RoleMultiplier + SignalBonus
  const postScore = baseScore * postTypeMultiplier * roleMultiplier + signalBonus;

  return {
    baseScore,
    postTypeMultiplier,
    roleMultiplier,
    signalBonus,
    postScore: Math.min(postScore, SCORE_CONSTANTS.POST_SCORE_MAX),
  };
}

/**
 * Legacy: Determine role based on follower count and language
 * Use calculateRoleMultiplier() for new implementations
 *
 * Different CT markets have different scales:
 * - English CT: ~10x larger than Korean CT
 * - Uses language-specific thresholds for fair role assignment
 *
 * Example thresholds:
 * - Korean KOL: 10,000+ followers
 * - English KOL: 50,000+ followers
 */
export function getRoleByFollowers(
  followerCount: number,
  language: AccountLanguage = 'en'
): AccountRole {
  const thresholds = FOLLOWER_THRESHOLDS[language] || FOLLOWER_THRESHOLDS.en;

  if (followerCount >= thresholds.kol) {
    return 'kol';
  }
  if (followerCount >= thresholds.proactive) {
    return 'proactive_ct';
  }
  return 'default';
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
 * Calculate raw score with weaker decay (for replies)
 *
 * Formula: RawScore = Σ(PostScore) × log₂(PostCount + 1) / PostCount^0.7
 *
 * This creates a gentler decay curve for replies to encourage engagement:
 * - 1 reply: 1.00 (100% efficiency)
 * - 2 replies: 0.97 (97% efficiency)
 * - 4 replies: 0.88 (88% efficiency)
 * - 8 replies: 0.75 (75% efficiency)
 */
export function calculateRawScoreWeakDecay(
  totalPostScore: number,
  postCount: number
): number {
  if (postCount <= 0 || totalPostScore <= 0) return 0;

  const effectivePosts = calculateEffectivePosts(postCount);
  const decayDivisor = Math.pow(postCount, SCORE_CONSTANTS.REPLY_DECAY_EXPONENT);
  return totalPostScore * (effectivePosts / decayDivisor);
}

/**
 * Calculate total raw score from per-type aggregations (Phase 9)
 *
 * - Original: full log decay
 * - Quote: full log decay
 * - Reply: weaker log decay (exponent 0.7)
 */
export function calculateTotalRawScoreByType(
  originalCount: number,
  originalScore: number,
  quoteCount: number,
  quoteScore: number,
  replyCount: number,
  replyScore: number
): number {
  const originalRaw = calculateRawScore(originalScore, originalCount);
  const quoteRaw = calculateRawScore(quoteScore, quoteCount);
  const replyRaw = calculateRawScoreWeakDecay(replyScore, replyCount);

  return originalRaw + quoteRaw + replyRaw;
}

/**
 * Calculate decayed raw score from individual posts, grouping by date.
 * Within each date group, apply per-type log decay to prevent daily spam.
 * Across days, no decay (reward consistent multi-day activity).
 *
 * This is a pure function used by generate-snapshot for stateless batch decay.
 * It replaces the cumulative season-wide decay with daily-scoped decay.
 */
export function calculateDecayedRawScoreFromPosts(
  posts: Array<{ postScore: number; createdAt: string; postType: PostType }>
): number {
  if (posts.length === 0) return 0;

  // Group posts by date (YYYY-MM-DD)
  const byDate = new Map<string, { original: number[]; quote: number[]; reply: number[] }>();
  for (const post of posts) {
    const date = post.createdAt.split('T')[0];
    if (!byDate.has(date)) byDate.set(date, { original: [], quote: [], reply: [] });
    byDate.get(date)![post.postType].push(post.postScore);
  }

  // For each date, apply per-type decay within the day (with hard caps)
  let totalDecayed = 0;
  for (const [, dayPosts] of byDate) {
    // Apply daily hard cap: keep highest-scoring posts up to the cap
    const origCapped = dayPosts.original.sort((a, b) => b - a).slice(0, SCORE_CONSTANTS.DAILY_CAP_ORIGINAL);
    const quoteCapped = dayPosts.quote.sort((a, b) => b - a).slice(0, SCORE_CONSTANTS.DAILY_CAP_QUOTE);
    const replyCapped = dayPosts.reply.sort((a, b) => b - a).slice(0, SCORE_CONSTANTS.DAILY_CAP_REPLY);

    const origScore = origCapped.reduce((s, v) => s + v, 0);
    const quoteScore = quoteCapped.reduce((s, v) => s + v, 0);
    const replyScore = replyCapped.reduce((s, v) => s + v, 0);

    totalDecayed += calculateRawScore(origScore, origCapped.length);
    totalDecayed += calculateRawScore(quoteScore, quoteCapped.length);
    totalDecayed += calculateRawScoreWeakDecay(replyScore, replyCapped.length);
  }

  return totalDecayed;
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
 * Formula: FreshnessMultiplier = 1 / (1 + max(0, DaysSinceLastPost - GraceDays) / 7)
 *
 * 3-day grace period, then 7-day half-life decay:
 * - 0~3 days: 1.00 (grace period)
 * - 4 days (eff 1): 0.875
 * - 7 days (eff 4): 0.636
 * - 10 days (eff 7): 0.500
 * - 17 days (eff 14): 0.333
 */
export function calculateFreshnessMultiplier(lastSeenAt: string): number {
  const lastSeenDate = new Date(lastSeenAt);
  const now = new Date();

  // Calculate days since last activity
  const daysSinceLastPost = Math.max(
    0,
    Math.floor((now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  const effectiveDays = Math.max(0, daysSinceLastPost - SCORE_CONSTANTS.FRESHNESS_GRACE_DAYS);
  return 1 / (1 + effectiveDays / SCORE_CONSTANTS.FRESHNESS_HALF_LIFE_DAYS);
}

/**
 * Calculate all score components from aggregate fields
 *
 * This is the single source of truth for score calculation.
 * Used by: calculateUserScore(), dynamodb-client calculateSeasonUserScore(),
 * generate-snapshot recalculateUserScore().
 *
 * Formula:
 *   BaseRawScore = per-type decay (or legacy fallback)
 *   CompressedRaw = BaseRawScore ^ RAW_SCORE_EXPONENT (0.8)
 *   RawScore = CompressedRaw (adjustment NOT included in rawScore)
 *   UserScore = Math.max(0, RawScore × ConsistencyBonus × FreshnessMultiplier + adjustmentTotalScore)
 */
export function calculateScoreComponents(params: {
  totalPostScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastSeenAt: string;
  // Per-type (optional, Phase 9)
  originalPostCount?: number;
  originalTotalScore?: number;
  quotePostCount?: number;
  quoteTotalScore?: number;
  replyPostCount?: number;
  replyTotalScore?: number;
  // Manual adjustment (optional)
  adjustmentTotalScore?: number;
  // Optional reference date for snapshot backfilling
  referenceDate?: Date;
}): {
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
  userScore: number;
} {
  const {
    totalPostScore,
    postCount,
    uniqueActiveDays,
    lastSeenAt,
    originalPostCount,
    originalTotalScore,
    quotePostCount,
    quoteTotalScore,
    replyPostCount,
    replyTotalScore,
    adjustmentTotalScore,
    referenceDate,
  } = params;

  // Phase 9: Use per-type calculation if available, otherwise fallback to legacy
  let baseRawScore: number;
  if (
    originalPostCount !== undefined &&
    quotePostCount !== undefined &&
    replyPostCount !== undefined
  ) {
    baseRawScore = calculateTotalRawScoreByType(
      originalPostCount,
      originalTotalScore || 0,
      quotePostCount,
      quoteTotalScore || 0,
      replyPostCount,
      replyTotalScore || 0
    );
  } else {
    baseRawScore = calculateRawScore(totalPostScore, postCount);
  }

  // Apply exponent compression to reduce score gaps between top ranks
  // Math.pow(300, 0.8) ≈ 121 vs Math.pow(20, 0.8) ≈ 13 — compresses high scores more
  const compressedRawScore = baseRawScore > 0
    ? Math.pow(baseRawScore, SCORE_CONSTANTS.RAW_SCORE_EXPONENT)
    : 0;

  // RawScore is pure post-based score; adjustment applied to final UserScore
  const rawScore = compressedRawScore;

  const consistencyBonus = calculateConsistencyBonus(uniqueActiveDays);

  // Freshness: use referenceDate if provided, otherwise current time
  let freshnessMultiplier: number;
  if (referenceDate) {
    const daysSinceLastPost = Math.max(
      0,
      Math.floor((referenceDate.getTime() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24))
    );
    const effectiveDays = Math.max(0, daysSinceLastPost - SCORE_CONSTANTS.FRESHNESS_GRACE_DAYS);
    freshnessMultiplier = 1 / (1 + effectiveDays / SCORE_CONSTANTS.FRESHNESS_HALF_LIFE_DAYS);
  } else {
    freshnessMultiplier = calculateFreshnessMultiplier(lastSeenAt);
  }

  // Adjustment applied to final score (not multiplied by CB/FM)
  const userScore = Math.max(0, rawScore * consistencyBonus * freshnessMultiplier + (adjustmentTotalScore || 0));

  return {
    rawScore: Math.round(rawScore * 1000) / 1000,
    consistencyBonus: Math.round(consistencyBonus * 1000) / 1000,
    freshnessMultiplier: Math.round(freshnessMultiplier * 1000) / 1000,
    userScore: Math.round(userScore * 1000) / 1000,
  };
}

/**
 * Calculate the complete user score from an Account record
 *
 * This is the main function used during leaderboard generation.
 * It calculates scores at read-time to ensure freshness is always current.
 *
 * Formula: UserScore = RawScore × ConsistencyBonus × FreshnessMultiplier
 *
 * Phase 9: If per-type fields are available, use type-specific calculations
 */
export function calculateUserScore(account: Account): ComputedUserScore {
  const effectivePosts = calculateEffectivePosts(account.postCount);

  const { rawScore, consistencyBonus, freshnessMultiplier, userScore } =
    calculateScoreComponents({
      totalPostScore: account.totalPostScore,
      postCount: account.postCount,
      uniqueActiveDays: account.uniqueActiveDays,
      lastSeenAt: account.lastSeenAt,
      originalPostCount: account.originalPostCount,
      originalTotalScore: account.originalTotalScore,
      quotePostCount: account.quotePostCount,
      quoteTotalScore: account.quoteTotalScore,
      replyPostCount: account.replyPostCount,
      replyTotalScore: account.replyTotalScore,
      adjustmentTotalScore: account.adjustmentTotalScore,
    });

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

/**
 * Get daily base score increment for a given rank.
 * Returns 0 for users not in the top 500 or with no previous rank.
 */
export function getDailyBaseScoreForRank(rank: number | undefined): number {
  if (rank === undefined || rank <= 0 || rank > 500) return 0;
  for (const tier of DAILY_BASE_SCORE_TIERS) {
    if (rank <= tier.maxRank) return tier.score;
  }
  return 0;
}

/**
 * Calculate daily base score with fixed cap applied.
 * Accumulates from previous snapshot, capped at DAILY_BASE_SCORE_CAP (10.0).
 */
export function calculateDailyBaseScore(params: {
  prevDailyBaseScoreTotal: number;
  prevRank: number | undefined;
}): number {
  const { prevDailyBaseScoreTotal, prevRank } = params;
  const increment = getDailyBaseScoreForRank(prevRank);
  const uncapped = prevDailyBaseScoreTotal + increment;
  return Math.round(Math.min(uncapped, DAILY_BASE_SCORE_CAP) * 1000) / 1000;
}
