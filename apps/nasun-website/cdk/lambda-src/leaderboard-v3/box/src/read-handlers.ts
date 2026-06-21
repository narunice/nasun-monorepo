// Box ports of the 6 public read handlers (get-leaderboard / get-my-rank / get-rank-history /
// get-top-climbers / get-account / search-accounts). Each is a pure function (query/path params ->
// { status, body }) that reads the box lb_* mirror via db.ts. The control flow + scoring math is
// byte-faithful to the lambda handlers; only the data source changes (DynamoDB -> box PG).
//
// Scope of the read slice: PUBLIC reads only. Admin-elevated limits (maxLimit 5000) + the cumulative
// all-time view are admin-gated on the lambda; here isAdmin is always false (no auth in the read slice),
// so a no-auth request gets the byte-identical public-capped view -- the cumulative path returns 401 like
// the lambda would for a non-admin. Admin auth (dual-jwks) arrives with the admin-handler slice.
//
// get-my-rank's lazy syncProfileFromUserProfiles WRITE is intentionally dropped (the mirror is read-only
// and the campaign is paused, so no fresh posts). Rank/score/status fields are snapshot-derived and thus
// byte-identical; display-name/avatar enrichment from user_profiles is a read-only follow-up.

import type {
  Account,
  BadgeType,
  ComputedUserScore,
  DailySnapshot,
  FeaturedFeedItem,
  FeaturedFeedResponse,
  GetLeaderboardResponse,
  LeaderboardEntry,
  MyRankData,
  MyRankResponse,
  Platform,
  Post,
  RankChange,
  Season,
  SeasonLeaderboardEntry,
  SeasonLeaderboardResponse,
  TopClimberEntry,
  TopClimbersResponse,
} from '../../src/types';
import { PUBLIC_LEADERBOARD_LIMIT } from '../../src/types';
import { calculateRankChange } from '../../src/utils/rank';
import { getTodayDateString, getYesterdayDateString, getDateNDaysAgo, getDayOfYearKST } from '../../src/utils/date';
import * as db from './db';

type Query = Record<string, string | undefined>;
export type Result = { status: number; body: object };

// ---- shared pure entry builders (verbatim from get-leaderboard.ts) -------------------------------

function snapshotToLeaderboardEntry(snapshot: DailySnapshot, includeBreakdown: boolean): SeasonLeaderboardEntry {
  const entry: SeasonLeaderboardEntry = {
    rank: snapshot.rank,
    username: snapshot.username,
    originalUsername: snapshot.originalUsername,
    platform: snapshot.platform,
    userScore: Math.round(snapshot.userScore * 1000) / 1000,
    postCount: snapshot.postCount,
    uniqueActiveDays: snapshot.uniqueActiveDays,
    lastActivity: snapshot.snapshotTime,
    displayName: snapshot.displayName,
    profileImageUrl: snapshot.profileImageUrl,
    isRegistered: snapshot.isRegistered,
    isTelegramMember: snapshot.isTelegramMember,
    rankChange: snapshot.rankChange,
  };
  if (includeBreakdown) {
    entry.breakdown = {
      rawScore: Math.round(snapshot.rawScore * 1000) / 1000,
      consistencyBonus: Math.round(snapshot.consistencyBonus * 1000) / 1000,
      freshnessMultiplier: Math.round(snapshot.freshnessMultiplier * 1000) / 1000,
      dailyBaseScoreTotal: snapshot.dailyBaseScoreTotal,
    };
  }
  return entry;
}

// ---- GET /v3/leaderboard -------------------------------------------------------------------------

export async function getLeaderboard(query: Query): Promise<Result> {
  if (query.listSeasons === 'true') {
    const seasons = await db.getAllPublicSeasons();
    return { status: 200, body: { seasons } };
  }

  // Read slice: no auth -> public limits only (admin elevation deferred to the admin slice).
  const parsedLimit = parseInt(query.limit || '100', 10) || 100;
  const maxLimit = 500;
  const isAdmin = false;
  const limit = Math.min(parsedLimit, maxLimit);
  const offset = Math.max(0, parseInt(query.offset || '0', 10) || 0);
  const includeBreakdown = query.breakdown === 'true';
  const isCumulative = query.cumulative === 'true';
  const snapshotDate = query.snapshotDate;
  let seasonId = query.seasonId;

  // Cumulative all-time view is admin-only (parity: non-admin -> 401).
  if (isCumulative) {
    return { status: 401, body: { error: 'Cumulative view requires admin authentication' } };
  }

  let season: Season | null;
  if (seasonId) {
    season = await db.getSeasonById(seasonId);
    if (!season) return { status: 404, body: { error: `Season ${seasonId} not found` } };
  } else {
    season = await db.getActiveSeason();
    if (!season) {
      return {
        status: 200,
        body: { message: 'No active season', entries: [], totalCount: 0, calculatedAt: new Date().toISOString() },
      };
    }
    seasonId = season.seasonId;
  }

  // Past snapshot view
  if (snapshotDate) {
    const allSnapshots = await db.querySnapshot(seasonId, snapshotDate);
    if (allSnapshots.length === 0) return { status: 404, body: { error: `No snapshot found for ${snapshotDate}` } };
    const bannedIds = await db.getBannedAccountIds();
    const reranked = db.computeDisplayRanks(allSnapshots, bannedIds);
    const visible = isAdmin ? reranked : reranked.slice(0, PUBLIC_LEADERBOARD_LIMIT);
    const totalCount = visible.length;
    const paginated = visible.slice(offset, offset + limit);
    const entries = paginated.map((s) => snapshotToLeaderboardEntry(s, includeBreakdown));
    const response: SeasonLeaderboardResponse = {
      season: { seasonId: season.seasonId, name: season.name, startDate: season.startDate, endDate: season.endDate, status: season.status },
      entries,
      totalCount,
      snapshotDate,
      calculatedAt: allSnapshots[0]?.snapshotTime || new Date().toISOString(),
    };
    return { status: 200, body: response };
  }

  // Current leaderboard (snapshot-based)
  const todayDate = getTodayDateString();
  const isEndedSeason = season.status === 'ended' || season.status === 'archived';
  const { entries: todaySnapshots, date: usedSnapshotDate } = await db.getLatestSnapshot(
    seasonId,
    isEndedSeason ? season.endDate : undefined
  );

  if (todaySnapshots.length === 0) {
    const response: SeasonLeaderboardResponse = {
      season: { seasonId: season.seasonId, name: season.name, startDate: season.startDate, endDate: season.endDate, status: season.status },
      entries: [],
      totalCount: 0,
      calculatedAt: new Date().toISOString(),
    };
    return { status: 200, body: response };
  }

  const bannedIds = await db.getBannedAccountIds();
  const reranked = db.computeDisplayRanks(todaySnapshots, bannedIds);

  const yesterdayDate = getYesterdayDateString();
  const yesterdayRankMap = new Map<string, number>();
  if (!isEndedSeason && usedSnapshotDate === todayDate) {
    const yesterdaySnapshots = await db.querySnapshot(seasonId, yesterdayDate);
    const rerankedYesterday = db.computeDisplayRanks(yesterdaySnapshots, bannedIds);
    for (const s of rerankedYesterday) yesterdayRankMap.set(s.accountId, s.rank);
  }

  const visible = isAdmin ? reranked : reranked.slice(0, PUBLIC_LEADERBOARD_LIMIT);
  const totalCount = visible.length;
  const paginated = visible.slice(offset, offset + limit);

  const entries: SeasonLeaderboardEntry[] = paginated.map((snapshot) => {
    let rankChange: RankChange;
    if (!isEndedSeason && usedSnapshotDate === todayDate) {
      const yesterdayRank = yesterdayRankMap.get(snapshot.accountId);
      rankChange = calculateRankChange(snapshot.rank, yesterdayRank);
    } else {
      rankChange = snapshot.rankChange || { direction: 'same', amount: 0 };
    }
    return snapshotToLeaderboardEntry({ ...snapshot, rankChange }, includeBreakdown);
  });

  const response: SeasonLeaderboardResponse = {
    season: { seasonId: season.seasonId, name: season.name, startDate: season.startDate, endDate: season.endDate, status: season.status },
    entries,
    totalCount,
    snapshotDate: usedSnapshotDate,
    calculatedAt: todaySnapshots[0]?.snapshotTime || new Date().toISOString(),
  };
  return { status: 200, body: response };
}

// ---- GET /v3/leaderboard/my-rank -----------------------------------------------------------------

export async function getMyRank(query: Query): Promise<Result> {
  const username = query.username;
  let seasonId = query.seasonId;
  if (!username) return { status: 400, body: { error: 'Query parameter "username" is required' } };

  let season: Season | null;
  if (seasonId) {
    season = await db.getSeasonById(seasonId);
    if (!season) return { status: 404, body: { error: `Season "${seasonId}" not found` } };
  } else {
    season = await db.getActiveSeason();
    if (!season) return { status: 404, body: { error: 'No active season found' } };
    seasonId = season.seasonId;
  }

  // my-rank strips the leading @ (parity with get-my-rank's local getAccountByUsername).
  const account = await db.getAccountByUsername('twitter', username.toLowerCase().replace(/^@/, ''));
  if (!account || account.isBanned) {
    const notRanked: MyRankResponse = { success: true, data: { status: 'not_ranked' }, seasonId, calculatedAt: new Date().toISOString() };
    return { status: 200, body: notRanked };
  }

  const todayDate = getTodayDateString();
  const yesterdayDate = getYesterdayDateString();
  const isEndedSeason = season.status === 'ended' || season.status === 'archived';
  const MAX_FALLBACK_DAYS = 7;

  let userSnapshot: DailySnapshot | null = null;
  let usedSnapshotDate = isEndedSeason ? season.endDate : todayDate;
  for (let daysBack = 0; daysBack <= MAX_FALLBACK_DAYS; daysBack++) {
    let dateStr: string;
    if (isEndedSeason) {
      const d = new Date(season.endDate);
      d.setDate(d.getDate() - daysBack);
      dateStr = d.toISOString().split('T')[0];
    } else {
      const d = new Date();
      d.setTime(d.getTime() + 9 * 60 * 60 * 1000); // KST
      d.setDate(d.getDate() - daysBack);
      dateStr = d.toISOString().split('T')[0];
    }
    userSnapshot = await db.getUserSnapshot(seasonId, account.accountId, dateStr);
    if (userSnapshot) {
      usedSnapshotDate = dateStr;
      break;
    }
  }

  if (!userSnapshot) {
    // Has a SeasonAccountScore record but no snapshot yet -> show the "rank will update" hint (parity with
    // get-my-rank's getSeasonAccountScore existence check).
    const hasSeasonAccount = await db.hasSeasonAccount(seasonId, account.accountId);
    const notRanked: MyRankResponse = {
      success: true,
      data: {
        status: 'not_ranked',
        username: account.username,
        originalUsername: account.originalUsername,
        displayName: account.displayName,
        profileImageUrl: account.profileImageUrl,
        message: hasSeasonAccount ? 'Your rank will be updated at 9:00 AM KST' : undefined,
      },
      seasonId,
      calculatedAt: new Date().toISOString(),
    };
    return { status: 200, body: notRanked };
  }

  const bannedIds = await db.getBannedAccountIds();
  const bannedAbove = await db.countBannedAboveRank(seasonId, usedSnapshotDate, userSnapshot.rank, bannedIds);
  const adjustedRank = userSnapshot.rank - bannedAbove;

  if (adjustedRank > PUBLIC_LEADERBOARD_LIMIT) {
    const outsideData: MyRankData = {
      status: 'outside_top',
      username: userSnapshot.username,
      originalUsername: userSnapshot.originalUsername || account.originalUsername,
      displayName: userSnapshot.displayName || account.displayName,
      profileImageUrl: userSnapshot.profileImageUrl || account.profileImageUrl,
    };
    return {
      status: 200,
      body: {
        success: true,
        data: outsideData,
        seasonId,
        snapshotDate: usedSnapshotDate,
        calculatedAt: userSnapshot.snapshotTime || new Date().toISOString(),
      } satisfies MyRankResponse,
    };
  }

  let rankChange: RankChange;
  if (!isEndedSeason && usedSnapshotDate === todayDate) {
    const yesterdaySnapshot = await db.getUserSnapshot(seasonId, account.accountId, yesterdayDate);
    if (yesterdaySnapshot) {
      const yBannedAbove = await db.countBannedAboveRank(seasonId, yesterdayDate, yesterdaySnapshot.rank, bannedIds);
      rankChange = calculateRankChange(adjustedRank, yesterdaySnapshot.rank - yBannedAbove);
    } else {
      rankChange = calculateRankChange(adjustedRank, undefined);
    }
  } else {
    rankChange = userSnapshot.rankChange || { direction: 'same', amount: 0 };
  }

  const data: MyRankData = {
    status: 'ranked',
    rank: adjustedRank,
    userScore: userSnapshot.userScore,
    postCount: userSnapshot.postCount,
    username: userSnapshot.username,
    originalUsername: userSnapshot.originalUsername || account.originalUsername,
    displayName: userSnapshot.displayName || account.displayName,
    profileImageUrl: userSnapshot.profileImageUrl || account.profileImageUrl,
    rankChange,
  };
  return {
    status: 200,
    body: {
      success: true,
      data,
      seasonId,
      snapshotDate: usedSnapshotDate,
      calculatedAt: userSnapshot.snapshotTime || new Date().toISOString(),
    } satisfies MyRankResponse,
  };
}

// ---- GET /v3/leaderboard/rank-history ------------------------------------------------------------

const VALID_DAYS = [7, 14, 30, 90];

interface RankHistoryEntry { date: string; rank: number; userScore: number; postCount: number; rankChange?: RankChange }

function calculateStats(history: RankHistoryEntry[]) {
  if (history.length === 0) {
    return { bestRank: 0, worstRank: 0, averageRank: 0, currentRank: 0, totalDays: 0, scoreIncrease: 0, rankImprovement: 0 };
  }
  const ranks = history.map((h) => h.rank);
  const bestRank = Math.min(...ranks);
  const worstRank = Math.max(...ranks);
  const averageRank = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length);
  const currentRank = history[history.length - 1].rank;
  const firstRank = history[0].rank;
  const firstScore = history[0].userScore;
  const lastScore = history[history.length - 1].userScore;
  const scoreIncrease = Math.round((lastScore - firstScore) * 1000) / 1000;
  const rankImprovement = firstRank - currentRank;
  return { bestRank, worstRank, averageRank, currentRank, totalDays: history.length, scoreIncrease, rankImprovement };
}

export async function getRankHistory(query: Query): Promise<Result> {
  const username = query.username;
  let seasonId = query.seasonId;
  const daysParam = query.days;
  if (!username) return { status: 400, body: { error: 'Query parameter "username" is required' } };

  let days = 7;
  if (daysParam) {
    const parsed = parseInt(daysParam, 10);
    if (isNaN(parsed) || !VALID_DAYS.includes(parsed)) {
      return { status: 400, body: { error: `Query parameter "days" must be one of: ${VALID_DAYS.join(', ')}` } };
    }
    days = parsed;
  }

  let season: Season | null;
  if (seasonId) {
    season = await db.getSeasonById(seasonId);
    if (!season) return { status: 404, body: { error: `Season "${seasonId}" not found` } };
  } else {
    season = await db.getActiveSeason();
    if (!season) return { status: 404, body: { error: 'No active season found' } };
    seasonId = season.seasonId;
  }

  // rank-history strips the leading @ (parity with get-rank-history's local getAccountByUsername).
  const account = await db.getAccountByUsername('twitter', username.toLowerCase().replace(/^@/, ''));
  if (!account || account.isBanned) return { status: 404, body: { error: 'User not found or banned' } };

  const startDate = getDateNDaysAgo(days);
  const snapshots = await db.getRankHistoryFromSnapshots(account.accountId, seasonId, startDate);
  const bannedIds = await db.getBannedAccountIds();

  let adjustedRanks: number[];
  if (bannedIds.size > 0) {
    const counts = await Promise.all(snapshots.map((s) => db.countBannedAboveRank(seasonId!, s.snapshotDate, s.rank, bannedIds)));
    adjustedRanks = snapshots.map((s, i) => Math.max(1, s.rank - counts[i]));
  } else {
    adjustedRanks = snapshots.map((s) => s.rank);
  }

  const history: RankHistoryEntry[] = snapshots
    .map((snapshot, index) => ({
      date: snapshot.snapshotDate,
      rank: adjustedRanks[index],
      userScore: snapshot.userScore,
      postCount: snapshot.postCount,
      rankChange: snapshot.rankChange,
    }))
    .filter((entry) => entry.rank <= PUBLIC_LEADERBOARD_LIMIT);

  const stats = calculateStats(history);
  const latestSnapshot = snapshots[snapshots.length - 1];
  const profile = {
    username: account.username,
    originalUsername: account.originalUsername || latestSnapshot?.originalUsername,
    displayName: account.displayName || latestSnapshot?.displayName,
    profileImageUrl: account.profileImageUrl || latestSnapshot?.profileImageUrl,
  };

  return {
    status: 200,
    body: { success: true, data: { history, stats, profile }, seasonId, calculatedAt: new Date().toISOString() },
  };
}

// ---- GET /v3/leaderboard/top-climbers ------------------------------------------------------------

function calculateTopClimbers(
  currentSnapshot: Map<string, DailySnapshot>,
  previousSnapshot: Map<string, DailySnapshot>,
  limit: number
): TopClimberEntry[] {
  const climbers: TopClimberEntry[] = [];
  for (const [accountId, current] of currentSnapshot) {
    const previous = previousSnapshot.get(accountId);
    let rankChange: number;
    let direction: 'up' | 'down' | 'same' | 'new';
    if (!previous) {
      direction = 'new';
      rankChange = 0;
    } else {
      rankChange = previous.rank - current.rank;
      if (rankChange > 0) direction = 'up';
      else if (rankChange < 0) direction = 'down';
      else direction = 'same';
    }
    if ((direction === 'up' || direction === 'new') && current.rank <= 100) {
      const previousScore = previous?.userScore || 0;
      const scoreIncrease = current.userScore - previousScore;
      const percentageIncrease = previousScore > 0 ? (scoreIncrease / previousScore) * 100 : 0;
      climbers.push({
        accountId,
        username: current.username,
        originalUsername: current.originalUsername,
        platform: current.platform,
        displayName: current.displayName,
        profileImageUrl: current.profileImageUrl,
        currentRank: current.rank,
        previousRank: previous ? (previous.rank > PUBLIC_LEADERBOARD_LIMIT ? null : previous.rank) : 0,
        rankChange: { direction, amount: Math.abs(rankChange) },
        currentScore: current.userScore,
        previousScore,
        scoreIncrease,
        percentageIncrease,
      });
    }
  }
  climbers.sort((a, b) => {
    if (a.rankChange.direction === 'new' && b.rankChange.direction !== 'new') return 1;
    if (a.rankChange.direction !== 'new' && b.rankChange.direction === 'new') return -1;
    if (b.rankChange.amount !== a.rankChange.amount) return b.rankChange.amount - a.rankChange.amount;
    return a.currentRank - b.currentRank;
  });
  return climbers.slice(0, limit);
}

export async function getTopClimbers(query: Query): Promise<Result> {
  const range = (query.range || '7d') as 'today' | '7d' | '4w';
  const limit = Math.min(parseInt(query.limit || '10', 10), 50);
  let seasonId = query.seasonId;

  let season: Season | null;
  if (seasonId) {
    season = await db.getSeasonById(seasonId);
    if (!season) return { status: 404, body: { error: `Season ${seasonId} not found` } };
  } else {
    season = await db.getActiveSeason();
    if (!season) return { status: 404, body: { error: 'No active season found' } };
    seasonId = season.seasonId;
  }

  const isEndedSeason = season.status === 'ended' || season.status === 'archived';
  const currentDate = isEndedSeason ? season.endDate : getTodayDateString();

  let previousDate: string;
  const shiftDays = range === 'today' ? 1 : range === '4w' ? 28 : 7;
  if (isEndedSeason) {
    const d = new Date(season.endDate);
    d.setDate(d.getDate() - shiftDays);
    previousDate = d.toISOString().split('T')[0];
  } else {
    previousDate = getDateNDaysAgo(shiftDays);
  }

  const currentSnapshot = await db.getSnapshotMap(seasonId, currentDate);
  if (currentSnapshot.size === 0) {
    const MAX_FALLBACK_DAYS = 7;
    for (let daysBack = 1; daysBack <= MAX_FALLBACK_DAYS; daysBack++) {
      let fallbackDate: string;
      if (isEndedSeason) {
        const d = new Date(season.endDate);
        d.setDate(d.getDate() - daysBack);
        fallbackDate = d.toISOString().split('T')[0];
      } else {
        fallbackDate = getDateNDaysAgo(daysBack);
      }
      const fallbackSnapshot = await db.getSnapshotMap(seasonId, fallbackDate);
      if (fallbackSnapshot.size > 0) {
        for (const [k, v] of fallbackSnapshot) currentSnapshot.set(k, v);
        const d = new Date(fallbackDate);
        d.setDate(d.getDate() - shiftDays);
        previousDate = d.toISOString().split('T')[0];
        break;
      }
    }
  }

  if (currentSnapshot.size === 0) {
    return {
      status: 200,
      body: { seasonId, range, climbers: [], calculatedAt: new Date().toISOString(), message: 'No snapshot data available yet' },
    };
  }

  const previousSnapshot = await db.getSnapshotMap(seasonId, previousDate);
  const bannedIds = await db.getBannedAccountIds();
  const allClimbers = calculateTopClimbers(currentSnapshot, previousSnapshot, limit + 20);
  const climbers = allClimbers.filter((c) => !bannedIds.has(c.accountId)).slice(0, limit);

  const response: TopClimbersResponse = { seasonId, range, climbers, calculatedAt: new Date().toISOString() };
  return { status: 200, body: response };
}

// ---- GET /v3/accounts/{username} -----------------------------------------------------------------

export async function getAccount(pathUsername: string | undefined, query: Query): Promise<Result> {
  if (!pathUsername) return { status: 400, body: { error: 'Username is required' } };
  const platform = (query.platform as Platform) || 'twitter';
  const account = await db.getAccountByUsername(platform, pathUsername.toLowerCase());
  if (!account) return { status: 200, body: { found: false } };

  let recentPosts;
  if (query.includePosts === 'true') {
    recentPosts = await db.getPostsByAccountId(account.accountId, 10);
    recentPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return { status: 200, body: { found: true, account, recentPosts } };
}

// ---- GET /v3/accounts/search ---------------------------------------------------------------------

async function getSeasonRanks(seasonId: string, accountIds: string[]): Promise<Map<string, { userScore: number; rank: number }>> {
  const rankMap = new Map<string, { userScore: number; rank: number }>();
  const season = await db.getSeasonById(seasonId);
  if (!season) return rankMap;
  const isEndedSeason = season.status === 'ended' || season.status === 'archived';
  const { entries } = await db.getLatestSnapshot(seasonId, isEndedSeason ? season.endDate : undefined);
  if (entries.length === 0) return rankMap;
  const bannedIds = await db.getBannedAccountIds();
  const reranked = db.computeDisplayRanks(entries, bannedIds);
  const idSet = new Set(accountIds);
  for (const entry of reranked) {
    if (idSet.has(entry.accountId)) rankMap.set(entry.accountId, { userScore: entry.userScore || 0, rank: entry.rank });
  }
  return rankMap;
}

export async function searchAccounts(query: Query): Promise<Result> {
  const q = query.q;
  if (!q) return { status: 400, body: { error: 'Query parameter "q" is required' } };
  let limit = parseInt(query.limit || '10', 10);
  if (isNaN(limit) || limit < 1) limit = 10;
  if (limit > 20) limit = 20;

  const accounts = await db.searchAccounts(q, limit);
  if (accounts.length === 0) return { status: 200, body: { accounts: [], total: 0 } };

  let rankMap: Map<string, { userScore: number; rank: number }> | undefined;
  if (query.seasonId) {
    rankMap = await getSeasonRanks(query.seasonId, accounts.map((a) => a.accountId));
  }

  const results = accounts.map((account: Account) => {
    const rankInfo = rankMap?.get(account.accountId);
    const isInPublicRange = rankInfo && rankInfo.rank <= PUBLIC_LEADERBOARD_LIMIT;
    return {
      accountId: account.accountId,
      username: account.username,
      originalUsername: account.originalUsername,
      platform: account.platform,
      displayName: account.displayName,
      profileImageUrl: account.profileImageUrl,
      userScore: isInPublicRange ? rankInfo!.userScore : undefined,
      rank: isInPublicRange ? rankInfo!.rank : undefined,
    };
  });
  return { status: 200, body: { accounts: results, total: results.length } };
}

// ---- GET /v3/feed/featured -----------------------------------------------------------------------

// Featured-feed's own climber calc (get-featured-feed.ts): only up/new movement, no percentageIncrease.
// Distinct from getTopClimbers' variant, so copied verbatim.
function featuredTopClimbers(
  currentSnapshot: Map<string, DailySnapshot>,
  previousSnapshot: Map<string, DailySnapshot>,
  limit: number
): TopClimberEntry[] {
  const climbers: TopClimberEntry[] = [];
  for (const [accountId, current] of currentSnapshot) {
    const previous = previousSnapshot.get(accountId);
    let rankChange: number;
    let direction: 'up' | 'new';
    if (!previous) {
      direction = 'new';
      rankChange = 0;
    } else {
      rankChange = previous.rank - current.rank;
      if (rankChange <= 0) continue;
      direction = 'up';
    }
    climbers.push({
      accountId,
      username: current.username,
      originalUsername: current.originalUsername,
      platform: current.platform,
      displayName: current.displayName,
      profileImageUrl: current.profileImageUrl,
      currentRank: current.rank,
      previousRank: previous?.rank || 0,
      rankChange: { direction, amount: rankChange },
      currentScore: current.userScore,
    });
  }
  climbers.sort((a, b) => {
    if (a.rankChange.direction === 'new' && b.rankChange.direction !== 'new') return 1;
    if (a.rankChange.direction !== 'new' && b.rankChange.direction === 'new') return -1;
    if (b.rankChange.amount !== a.rankChange.amount) return b.rankChange.amount - a.rankChange.amount;
    return a.currentRank - b.currentRank;
  });
  return climbers.slice(0, limit);
}

// Best recent post for an account: latest 20, exclude replies, highest postScore, daily-rotate among top 3.
async function getBestRecentPost(accountId: string): Promise<Post | null> {
  const posts = await db.getPostsByAccountId(accountId, 20);
  const candidates = posts.filter((p) => p.postType === 'original' || p.postType === 'quote');
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.postScore ?? 0) - (a.postScore ?? 0));
  const top = candidates.slice(0, 3);
  const dayOfYear = getDayOfYearKST();
  return top[dayOfYear % top.length];
}

async function enrichCuratedItems(
  entries: Array<{ postId: string; badge: string; order: number }>
): Promise<FeaturedFeedItem[]> {
  const resolved = await Promise.all(
    entries
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(async (entry) => {
        const post = await db.getPostById(entry.postId);
        if (!post) return null;
        const account = await db.getAccountById(post.accountId);
        if (!account) return null;
        const item: FeaturedFeedItem = {
          type: 'post',
          postId: post.postId,
          author: {
            accountId: account.accountId,
            username: account.username,
            originalUsername: account.originalUsername,
            displayName: account.displayName,
            profileImageUrl: account.profileImageUrl,
            badges: [entry.badge as BadgeType],
          },
          content: {
            platform: post.platform,
            postUrl: post.postUrl,
            postType: post.postType || 'original',
            signals: post.contentSignals,
            createdAt: post.createdAt,
          },
        };
        return { order: entry.order, item };
      })
  );
  return resolved.filter((r): r is { order: number; item: FeaturedFeedItem } => r !== null).map((r) => r.item);
}

export async function getFeaturedFeed(query: Query): Promise<Result> {
  const MAX_FEED_ITEMS = 15;

  const curatedRecord = await db.getCuratedFeedRecord();
  let curatedItems: FeaturedFeedItem[] = [];
  const curatedAccountIds = new Set<string>();
  if (curatedRecord && curatedRecord.items.length > 0) {
    curatedItems = await enrichCuratedItems(curatedRecord.items);
    for (const item of curatedItems) curatedAccountIds.add(item.author.accountId);
    if (curatedItems.length >= MAX_FEED_ITEMS) {
      return {
        status: 200,
        body: { success: true, seasonId: 'curated', items: curatedItems.slice(0, MAX_FEED_ITEMS), calculatedAt: curatedRecord.updatedAt } satisfies FeaturedFeedResponse,
      };
    }
  }

  let seasonId = query.seasonId;
  const season = seasonId ? await db.getSeasonById(seasonId) : await db.getActiveSeason();
  if (!season) return { status: 404, body: { error: 'No active season found' } };
  seasonId = season.seasonId;

  const bannedIds = await db.getBannedAccountIds();
  const todayDate = getTodayDateString();
  const currentSnapshot = await db.getSnapshotMap(seasonId, todayDate);
  if (currentSnapshot.size === 0) {
    const yesterday = getDateNDaysAgo(1);
    const ySnap = await db.getSnapshotMap(seasonId, yesterday);
    for (const [k, v] of ySnap) currentSnapshot.set(k, v);
  }

  const allRankedUsers = Array.from(currentSnapshot.values())
    .filter((s) => !bannedIds.has(s.accountId))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 18);
  const topRankers = allRankedUsers.slice(0, 3);
  const remainingRankers = allRankedUsers.slice(3);

  let previousDate = getDateNDaysAgo(7);
  let previousSnapshot = await db.getSnapshotMap(seasonId, previousDate);
  if (previousSnapshot.size === 0) {
    previousDate = getDateNDaysAgo(1);
    previousSnapshot = await db.getSnapshotMap(seasonId, previousDate);
  }

  const rankerIds = new Set(topRankers.map((r) => r.accountId));
  const topClimbers = featuredTopClimbers(currentSnapshot, previousSnapshot, 10)
    .filter((c) => !bannedIds.has(c.accountId) && !rankerIds.has(c.accountId))
    .slice(0, 3);

  const userMap = new Map<string, { account: DailySnapshot | TopClimberEntry; badges: BadgeType[] }>();
  topRankers.forEach((ranker, index) => userMap.set(ranker.accountId, { account: ranker, badges: [`rank-${index + 1}` as BadgeType] }));
  topClimbers.forEach((climber, index) => {
    const badge = `climber-${index + 1}` as BadgeType;
    const existing = userMap.get(climber.accountId);
    if (existing) existing.badges.push(badge);
    else userMap.set(climber.accountId, { account: climber, badges: [badge] });
  });
  remainingRankers.forEach((ranker) => {
    if (!userMap.has(ranker.accountId)) userMap.set(ranker.accountId, { account: ranker, badges: ['ranker'] });
  });

  const postsMap = new Map<string, Post>();
  await Promise.all(
    Array.from(userMap.keys()).map(async (accountId) => {
      const post = await getBestRecentPost(accountId);
      if (post) postsMap.set(accountId, post);
    })
  );

  const algorithmicItems: FeaturedFeedItem[] = [];
  const addedAccountIds = new Set<string>(curatedAccountIds);
  const remainingSlots = MAX_FEED_ITEMS - curatedItems.length;
  const addFeedItem = (accountId: string) => {
    if (algorithmicItems.length >= remainingSlots) return;
    if (addedAccountIds.has(accountId)) return;
    const post = postsMap.get(accountId);
    const userInfo = userMap.get(accountId);
    if (post && userInfo) {
      const acct = userInfo.account;
      algorithmicItems.push({
        type: 'post',
        postId: post.postId,
        author: {
          accountId: acct.accountId,
          username: acct.username,
          originalUsername: acct.originalUsername,
          displayName: acct.displayName,
          profileImageUrl: acct.profileImageUrl,
          badges: userInfo.badges,
        },
        content: {
          platform: post.platform,
          postUrl: post.postUrl,
          postType: post.postType || 'original',
          signals: post.contentSignals,
          createdAt: post.createdAt,
        },
      });
      addedAccountIds.add(accountId);
    }
  };
  topRankers.forEach((r) => addFeedItem(r.accountId));
  topClimbers.forEach((c) => addFeedItem(c.accountId));
  for (const ranker of remainingRankers) {
    if (algorithmicItems.length >= remainingSlots) break;
    addFeedItem(ranker.accountId);
  }

  const allItems = [...curatedItems, ...algorithmicItems];
  return {
    status: 200,
    body: { success: true, seasonId, items: allItems, calculatedAt: new Date().toISOString() } satisfies FeaturedFeedResponse,
  };
}

// Reused by the admin featured-feed GET handler (enriched preview).
export { enrichCuratedItems as enrichCuratedItemsPublic };

// Silence unused-import lint for types only referenced structurally.
export type { ComputedUserScore, GetLeaderboardResponse, LeaderboardEntry };
