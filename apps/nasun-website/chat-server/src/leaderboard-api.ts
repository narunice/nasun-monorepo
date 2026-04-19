/**
 * Leaderboard REST API handler module.
 * Separated from server.ts for maintainability and extensibility.
 * All endpoints are conditionally enabled via DEEPBOOK_PACKAGE env var.
 *
 * Currently hosts pado-specific endpoints under /api/pado/* (Score API) alongside
 * legacy unprefixed routes. Table trader_points is historical name; values are
 * DEX trading scores. Pado-specific logic is scheduled to migrate to
 * apps/pado/data-server/ when trigger conditions met.
 *
 * Route convention: pado-specific = /api/pado/*, future apps = /api/{app}/*.
 * Legacy unprefixed routes (/api/leaderboard/*, /api/trades/*, /api/orders/*,
 * /api/competitions/*, /api/feed) pending follow-up migration.
 * See .claude/handoffs/2026-04-12-chat-server-role-clarification.md
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const X_HANDLE_RE = /^[A-Za-z0-9_]{1,50}$/;
function sanitizeXHandle(raw: string | undefined): string | null {
  if (!raw) return null;
  return X_HANDLE_RE.test(raw) ? raw : null;
}
import type { ChatServerConfig } from './types.js';
import { getDisplayName, getDisplayNamesBatch, getFollowing, getFollowerCounts, getGenesisPassBatch, getProfileImagesBatch } from './store.js';
import { getPoolSymbol, getPoolBaseDecimals } from './rooms.js';
import {
  getLeaderboard, getLeaderboardPnl,
  getTraderAllPeriodStats, getTraderFills,
  getTotalFillsCount, getTotalTradersCount, getTotalPnlTradersCount,
  getIndexerState,
  getScoreLeaderboard, getTraderScore, getTotalScoreTraders, getPadoAggregatorLastRun,
  getTraderFillsByAddress, computeCostBasis,
  getOrderEventsByAddress,
  getWeeklyScoreLeaderboard, getWeeklyScoreCount, getTraderWeeklyScore,
  getAvailableWeeks,
  getCurrentWeekStart, getWeekId,
  getFollowedTraderFills,
  createCompetition, updateCompetition, getCompetition, listCompetitions,
  getCompetitionResults,
} from './leaderboard-store.js';
import { VALID_PERIODS, VALID_MODES, VALID_SCORE_SCOPES } from './leaderboard-types.js';
import type { CompetitionStatus, CompetitionRow } from './leaderboard-types.js';
import { mapRowToListItem } from './leaderboard-mapper.js';
import { resolveIdentityIds, checkSocialConnectionsBatch, getTwitterHandlesBatch } from './identity-resolver.js';

// ===== Dependency injection interface =====

export interface LeaderboardApiDeps {
  resolveSessionToken: (authHeader: string | undefined) => string | null;
}

// ===== Rate limiting =====

const apiRateMap = new Map<string, { count: number; resetAt: number }>();
const API_RATE_MAX = 30;
const API_RATE_WINDOW_MS = 60_000;

function checkApiRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = apiRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    apiRateMap.set(ip, { count: 1, resetAt: now + API_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= API_RATE_MAX) return false;
  entry.count++;
  return true;
}

export function cleanupApiRateLimits(): void {
  const now = Date.now();
  for (const [ip, entry] of apiRateMap) {
    if (now > entry.resetAt) apiRateMap.delete(ip);
  }
}

// ===== Follower count cache =====

const FOLLOWER_CACHE_TTL = 30_000; // 30 seconds
const followerCountCache = { data: new Map<string, number>(), expiresAt: 0 };

function getCachedFollowerCounts(addresses: string[]): Map<string, number> {
  if (followerCountCache.expiresAt > Date.now()) {
    const result = new Map<string, number>();
    for (const addr of addresses) {
      result.set(addr, followerCountCache.data.get(addr) ?? 0);
    }
    return result;
  }
  followerCountCache.data = new Map<string, number>();
  const counts = getFollowerCounts(addresses);
  for (const [addr, count] of counts) {
    followerCountCache.data.set(addr, count);
  }
  followerCountCache.expiresAt = Date.now() + FOLLOWER_CACHE_TTL;
  return counts;
}

// ===== Helper functions =====

function checkAdminAuth(
  req: { headers?: Record<string, string | string[] | undefined> },
  key: string,
): boolean {
  if (!key || key.length < 32) return false;
  const authHeader = req.headers?.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const tokenBuf = Buffer.from(token);
  const keyBuf = Buffer.from(key);
  if (tokenBuf.length !== keyBuf.length) return false;
  return timingSafeEqual(tokenBuf, keyBuf);
}

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 10 * 1024; // 10KB
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function formatQuoteVolume(rawVolume: string): string {
  try {
    const raw = BigInt(rawVolume || '0');
    if (raw < 0n) return '0.00';
    const whole = raw / 1_000_000n;
    const frac = raw % 1_000_000n;
    const fracStr = frac.toString().padStart(6, '0').slice(0, 2);
    return `${whole}.${fracStr}`;
  } catch {
    return '0.00';
  }
}

function getClientIp(req: IncomingMessage): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
}

// ===== Main handler =====

/**
 * Handle leaderboard/trade/feed/competition REST API requests.
 * Returns true if the request was handled, false otherwise.
 */
export function handleLeaderboardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  corsHeaders: Record<string, string>,
  config: ChatServerConfig,
  deps: LeaderboardApiDeps,
): boolean {
  const { pathname } = url;
  // Treat HEAD as GET (same response, no body per HTTP spec)
  const rawMethod = req.method || 'GET';
  const method = rawMethod === 'HEAD' ? 'GET' : rawMethod;

  // Only handle known API prefixes
  if (!pathname.startsWith('/api/leaderboard') &&
      !pathname.startsWith('/api/pado/') &&
      !pathname.startsWith('/api/trades') &&
      !pathname.startsWith('/api/orders') &&
      !pathname.startsWith('/api/competitions') &&
      pathname !== '/api/feed') {
    return false;
  }

  // Handle OPTIONS with appropriate methods per route
  if (method === 'OPTIONS') {
    const needsWrite = pathname.startsWith('/api/competitions');
    const methods = needsWrite
      ? 'GET, POST, PATCH, OPTIONS'
      : 'GET, OPTIONS';
    res.writeHead(204, {
      ...corsHeaders,
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  // Rate limit
  if (!checkApiRateLimit(getClientIp(req))) {
    res.writeHead(429, corsHeaders);
    res.end(JSON.stringify({ error: 'Too many requests' }));
    return true;
  }

  // Route to specific handler
  try {
    if (pathname === '/api/feed' && method === 'GET') {
      return handleFeed(req, res, url, corsHeaders, deps);
    }
    if (pathname === '/api/leaderboard' && method === 'GET') {
      return handleLeaderboard(res, url, corsHeaders);
    }
    if (pathname === '/api/leaderboard/status' && method === 'GET') {
      return handleLeaderboardStatus(res, corsHeaders, config);
    }
    if (pathname === '/api/pado/leaderboard/score' && method === 'GET') {
      return handleScoreLeaderboard(res, url, corsHeaders);
    }
    if (pathname === '/api/pado/leaderboard/score/alltime' && method === 'GET') {
      return handleScoreLeaderboardAlltime(res, url, corsHeaders);
    }
    if (pathname === '/api/pado/leaderboard/score/weekly' && method === 'GET') {
      const weeks = getAvailableWeeks();
      res.writeHead(200, { ...corsHeaders, 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' });
      res.end(JSON.stringify({ weeks }));
      return true;
    }

    // Internal endpoint: settlement server (settle-pado on node-3) pulls weekly scores
    const internalWeeklyMatch = pathname.match(/^\/api\/pado\/internal\/weekly-scores\/(\d{4}-W\d{2})$/);
    if (internalWeeklyMatch && method === 'GET') {
      handleInternalWeeklyScores(req, res, corsHeaders, internalWeeklyMatch[1]).catch((err) => {
        console.error('[InternalWeeklyScores] Error:', (err as Error).message);
        if (!res.writableEnded) {
          res.writeHead(500, corsHeaders);
          res.end(JSON.stringify({ error: 'internal_error' }));
        }
      });
      return true;
    }

    const weeklyScoreMatch = pathname.match(/^\/api\/pado\/leaderboard\/score\/weekly\/(\d{4}-W\d{2})$/);
    if (weeklyScoreMatch && method === 'GET') {
      handleScoreLeaderboardWeekly(res, url, corsHeaders, weeklyScoreMatch[1]).catch((err) => {
        console.error('[ScoreLeaderboardWeekly] Error:', (err as Error).message);
        if (!res.writableEnded) {
          res.writeHead(500, corsHeaders);
          res.end(JSON.stringify({ error: 'internal_error' }));
        }
      });
      return true;
    }
    // Pattern-matched routes
    const traderMatch = pathname.match(/^\/api\/leaderboard\/trader\/(0x[a-fA-F0-9]{64})$/);
    if (traderMatch && method === 'GET') {
      return handleTraderStats(res, corsHeaders, traderMatch[1]);
    }

    const fillsMatch = pathname.match(/^\/api\/leaderboard\/trader\/(0x[a-fA-F0-9]{64})\/fills$/);
    if (fillsMatch && method === 'GET') {
      return handleTraderFills(res, url, corsHeaders, fillsMatch[1]);
    }

    const scoreMatch = pathname.match(/^\/api\/pado\/leaderboard\/trader\/(0x[a-fA-F0-9]{64})\/score$/);
    if (scoreMatch && method === 'GET') {
      return handleTraderScore(res, url, corsHeaders, scoreMatch[1]);
    }

    const tradesMatch = pathname.match(/^\/api\/trades\/(0x[a-fA-F0-9]{64})$/);
    if (tradesMatch && method === 'GET') {
      return handleTrades(res, url, corsHeaders, tradesMatch[1]);
    }

    const costBasisMatch = pathname.match(/^\/api\/trades\/(0x[a-fA-F0-9]{64})\/cost-basis$/);
    if (costBasisMatch && method === 'GET') {
      return handleCostBasis(res, corsHeaders, costBasisMatch[1]);
    }

    const ordersMatch = pathname.match(/^\/api\/orders\/(0x[a-fA-F0-9]{64})$/);
    if (ordersMatch && method === 'GET') {
      return handleOrders(res, url, corsHeaders, ordersMatch[1]);
    }

    // Competition routes
    if (pathname === '/api/competitions' && method === 'GET') {
      return handleCompetitionList(res, url, corsHeaders);
    }
    if (pathname === '/api/competitions' && method === 'POST') {
      handleCompetitionCreate(req, res, corsHeaders, config);
      return true;
    }
    const compResultsMatch = pathname.match(/^\/api\/competitions\/([a-zA-Z0-9_-]+)\/results$/);
    if (compResultsMatch && method === 'GET') {
      return handleCompetitionResults(res, url, corsHeaders, compResultsMatch[1]);
    }
    const compDetailMatch = pathname.match(/^\/api\/competitions\/([a-zA-Z0-9_-]+)$/);
    if (compDetailMatch && method === 'GET') {
      return handleCompetitionDetail(res, corsHeaders, compDetailMatch[1]);
    }
    const compPatchMatch = pathname.match(/^\/api\/competitions\/([a-zA-Z0-9_-]{1,64})$/);
    if (compPatchMatch && method === 'PATCH') {
      handleCompetitionUpdate(req, res, corsHeaders, config, compPatchMatch[1]);
      return true;
    }
  } catch (err) {
    console.error('[LeaderboardAPI] Unhandled error:', (err as Error).message);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return true;
  }

  return false; // Not handled
}

// ===== Individual route handlers =====

function handleFeed(
  req: IncomingMessage, res: ServerResponse, url: URL,
  corsHeaders: Record<string, string>, deps: LeaderboardApiDeps,
): boolean {
  const address = deps.resolveSessionToken(req.headers.authorization);
  if (!address) {
    res.writeHead(401, corsHeaders);
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return true;
  }

  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10), 1), 50);
  const beforeTsParam = url.searchParams.get('beforeTs');
  const beforeTs = beforeTsParam ? parseInt(beforeTsParam, 10) : undefined;

  if (beforeTs !== undefined && (!Number.isFinite(beforeTs) || beforeTs < 0)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'Invalid beforeTs' }));
    return true;
  }

  const following = getFollowing(address);
  if (following.length === 0) {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ activities: [], hasMore: false, followCount: 0 }));
    return true;
  }

  const { fills, hasMore } = getFollowedTraderFills(following, limit, beforeTs);
  const traderAddresses = [...new Set(fills.map((f) => f.address))];
  const nicknames = traderAddresses.length > 0 ? getDisplayNamesBatch(traderAddresses) : new Map();

  const activities = fills.map((fill) => {
    const isTaker = fill.address === fill.taker_address;
    const isBid = !!fill.taker_is_bid;
    const side = isTaker ? (isBid ? 'buy' : 'sell') : (isBid ? 'sell' : 'buy');
    return {
      type: 'trade' as const,
      traderAddress: fill.address,
      traderNickname: nicknames.get(fill.address) ?? null,
      timestamp: fill.timestamp_ms,
      data: {
        poolId: fill.pool_id,
        pair: `${getPoolSymbol(fill.pool_id) ?? 'UNKNOWN'}/NUSDC`,
        side,
        price: formatQuoteVolume(fill.price),
        baseQuantity: fill.base_quantity,
        quoteQuantity: formatQuoteVolume(fill.quote_quantity),
        txDigest: fill.tx_digest,
      },
    };
  });

  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ activities, hasMore, followCount: following.length }));
  return true;
}

function handleLeaderboard(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>,
): boolean {
  const period = url.searchParams.get('period') || '24h';
  const mode = url.searchParams.get('mode') || 'volume';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  if (!VALID_PERIODS.has(period)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'Invalid period. Use: 24h, 7d, 30d, all' }));
    return true;
  }
  if (!VALID_MODES.has(mode)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'Invalid mode. Use: volume, pnl' }));
    return true;
  }

  if (mode === 'pnl') {
    const rows = getLeaderboardPnl(period, limit, offset);
    const addresses = rows.map((r) => r.address);
    const nicknames = addresses.length > 0 ? getDisplayNamesBatch(addresses) : new Map();
    const followerCnts = addresses.length > 0 ? getCachedFollowerCounts(addresses) : new Map();
    const gpSet = addresses.length > 0 ? getGenesisPassBatch(addresses) : new Set<string>();
    const traders = rows.map((r) => ({
      rank: r.rank, address: r.address,
      nickname: nicknames.get(r.address) ?? null,
      hasGenesisPass: gpSet.has(r.address),
      pnlUsd: formatQuoteVolume(r.realized_pnl),
      pnlPercent: r.pnl_percent,
      tradeCount: r.trade_count,
      rankChange: r.prev_rank > 0 ? r.prev_rank - r.rank : 0,
      followerCount: followerCnts.get(r.address) ?? 0,
    }));
    const updatedAt = rows.length > 0 ? rows[0].updated_at : Date.now();
    const totalTraders = getTotalPnlTradersCount(period);
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ mode: 'pnl', period, traders, updatedAt, totalTraders }));
  } else {
    const rows = getLeaderboard(period, limit, offset);
    const addresses = rows.map((r) => r.address);
    const nicknames = addresses.length > 0 ? getDisplayNamesBatch(addresses) : new Map();
    const followerCnts = addresses.length > 0 ? getCachedFollowerCounts(addresses) : new Map();
    const gpSet = addresses.length > 0 ? getGenesisPassBatch(addresses) : new Set<string>();
    const traders = rows.map((r) => ({
      rank: r.rank, address: r.address,
      nickname: nicknames.get(r.address) ?? null,
      hasGenesisPass: gpSet.has(r.address),
      volumeUsd: formatQuoteVolume(r.volume_quote),
      tradeCount: r.trade_count, uniquePools: r.unique_pools,
      rankChange: r.prev_rank > 0 ? r.prev_rank - r.rank : 0,
      lastTradeAt: r.last_trade_at,
      followerCount: followerCnts.get(r.address) ?? 0,
    }));
    const updatedAt = rows.length > 0 ? rows[0].updated_at : Date.now();
    const totalTraders = getTotalTradersCount(period);
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ mode: 'volume', period, traders, updatedAt, totalTraders }));
  }
  return true;
}

function handleTraderStats(
  res: ServerResponse, corsHeaders: Record<string, string>, address: string,
): boolean {
  const rows = getTraderAllPeriodStats(address);
  const nickname = getDisplayName(address);
  const hasGenesisPass = getGenesisPassBatch([address]).has(address);
  const stats: Record<string, { rank: number; volume: string; tradeCount: number; uniquePools: number; rankChange: number } | null> = {
    '24h': null, '7d': null, '30d': null, 'all': null,
  };
  let lastTradeAt: number | null = null;
  for (const row of rows) {
    stats[row.period] = {
      rank: row.rank, volume: formatQuoteVolume(row.volume_quote),
      tradeCount: row.trade_count, uniquePools: row.unique_pools,
      rankChange: row.prev_rank > 0 ? row.prev_rank - row.rank : 0,
    };
    if (row.last_trade_at && (lastTradeAt === null || row.last_trade_at > lastTradeAt)) {
      lastTradeAt = row.last_trade_at;
    }
  }
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ address, nickname, hasGenesisPass, lastTradeAt, stats }));
  return true;
}

function handleTraderFills(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>, address: string,
): boolean {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 100);
  const rows = getTraderFills(address, limit);
  const hasMore = rows.length > limit;
  const fills = (hasMore ? rows.slice(0, limit) : rows).map((r) => {
    const isTaker = r.taker_address === address;
    const isBid = !!r.taker_is_bid;
    const side = isTaker ? (isBid ? 'buy' : 'sell') : (isBid ? 'sell' : 'buy');
    return {
      txDigest: r.tx_digest, poolId: r.pool_id, side,
      price: formatQuoteVolume(r.price),
      baseQuantity: r.base_quantity, quoteQuantity: formatQuoteVolume(r.quote_quantity),
      timestamp: r.timestamp_ms,
    };
  });
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ address, fills, hasMore }));
  return true;
}

function handleLeaderboardStatus(
  res: ServerResponse, corsHeaders: Record<string, string>, config: ChatServerConfig,
): boolean {
  const lastIndexedAt = getIndexerState('last_indexed_at');
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({
    indexerRunning: !!config.deepbookPackage,
    lastIndexedAt: lastIndexedAt ? parseInt(lastIndexedAt, 10) : 0,
    totalFillsIndexed: getTotalFillsCount(),
    totalTradersTracked: getTotalTradersCount(),
  }));
  return true;
}

// ===== Score (pado-specific) =====
// Reads same trader_points table as points endpoint; renames field to totalScore.
// Includes aggregator cycle-level updatedAt via getPadoAggregatorLastRun() for
// settle-pado staleness guard. Response Cache-Control max-age=30 relies on
// CloudFront /chat/* CachingDisabled — CDN bypass, browser caches 30s.

/**
 * GET /api/pado/leaderboard/score
 * Default: weekly scope (current week).
 * Legacy ?scope=alltime still supported for backward compatibility.
 */
function handleScoreLeaderboard(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>,
): boolean {
  const scope = url.searchParams.get('scope') || 'weekly';
  if (scope === 'alltime') {
    return handleScoreLeaderboardAlltime(res, url, corsHeaders);
  }
  if (scope !== 'weekly') {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({
      error: `scope '${scope}' not supported`,
      supported: Array.from(VALID_SCORE_SCOPES),
    }));
    return true;
  }
  const weekStart = getCurrentWeekStart();
  const weekId = getWeekId(weekStart);
  handleScoreLeaderboardWeekly(res, url, corsHeaders, weekId).catch((err) => {
    console.error('[ScoreLeaderboard] Error:', (err as Error).message);
    if (!res.writableEnded) {
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'internal_error' }));
    }
  });
  return true;
}

/**
 * GET /api/pado/leaderboard/score/alltime
 * Backward-compatible all-time score leaderboard (trader_points table).
 */
function handleScoreLeaderboardAlltime(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>,
): boolean {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  const rows = getScoreLeaderboard(limit, offset);
  const totalTraders = getTotalScoreTraders();
  const addresses = rows.map((r) => r.address);
  const nicknames = addresses.length > 0 ? getDisplayNamesBatch(addresses) : new Map<string, string>();
  const followerCounts = addresses.length > 0 ? getCachedFollowerCounts(addresses) : new Map<string, number>();
  const genesisPassSet = addresses.length > 0 ? getGenesisPassBatch(addresses) : new Set<string>();
  const extras = { nicknames, followerCounts, genesisPassSet };
  const traders = rows.map((row) => ({
    ...mapRowToListItem(row, extras, formatQuoteVolume),
    totalScore: row.total_points,
  }));
  res.writeHead(200, {
    ...corsHeaders,
    'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
  });
  res.end(JSON.stringify({
    scope: 'alltime',
    traders,
    updatedAt: getPadoAggregatorLastRun(),
    totalTraders,
  }));
  return true;
}

/**
 * GET /api/pado/leaderboard/score/weekly/:weekId
 * Weekly score leaderboard for a specific week_id (e.g. '2026-W17').
 */
/**
 * GET /api/pado/internal/weekly-scores/:weekId
 *
 * Internal endpoint for the settlement server (settle-pado, running on node-3).
 * Returns all top-500 traders for a completed week with identityId and hasGenesisPass.
 *
 * Auth: Authorization: Bearer <INTERNAL_API_KEY>
 * Safety: only returns data for weeks that have already ended (not the current week).
 */
async function handleInternalWeeklyScores(
  req: IncomingMessage,
  res: ServerResponse,
  corsHeaders: Record<string, string>,
  weekId: string,
): Promise<boolean> {
  // Auth check (timing-safe to prevent key oracle attacks)
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!checkAdminAuth(req, internalApiKey ?? '')) {
    res.writeHead(401, corsHeaders);
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return true;
  }

  // Safety: refuse requests for the current (in-progress) week.
  // The week is identified by its Monday 00:10 UTC start. If weekId matches the current
  // running week, the data is not final yet.
  const currentWeekId = getWeekId(getCurrentWeekStart());
  if (weekId === currentWeekId) {
    res.writeHead(403, corsHeaders);
    res.end(JSON.stringify({
      error: 'week_in_progress',
      message: `Week ${weekId} is still in progress. Request a past weekId.`,
    }));
    return true;
  }

  // Fetch all traders for this week (top 500 max, rank-ordered)
  const rows = getWeeklyScoreLeaderboard(weekId, 500, 0);
  if (rows.length === 0) {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ weekId, traders: [], totalTraders: 0 }));
    return true;
  }

  const addresses = rows.map((r) => r.address);

  // Resolve identityIds in bulk (uses in-memory cache from identity-resolver)
  const identityMap = await resolveIdentityIds(addresses);

  // Resolve Genesis Pass status from SQLite cache
  const genesisPassSet = getGenesisPassBatch(addresses);

  // Check social connections (Twitter/Google/Telegram) for all registered identities
  const identityIds = [...identityMap.values()];
  const socialSet = await checkSocialConnectionsBatch(identityIds);

  const traders = rows.map((row) => {
    const identityId = identityMap.get(row.address) ?? null;
    return {
      rank: row.rank,
      address: row.address,
      identityId,
      hasGenesisPass: genesisPassSet.has(row.address),
      hasSocialAccount: identityId !== null && socialSet.has(identityId),
      totalScore: row.total_score,
    };
  });

  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({
    weekId,
    traders,
    totalTraders: rows.length,
    generatedAt: Date.now(),
  }));
  return true;
}

async function handleScoreLeaderboardWeekly(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>, weekId: string,
): Promise<void> {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  const rows = getWeeklyScoreLeaderboard(weekId, limit, offset);
  const totalTraders = getWeeklyScoreCount(weekId);
  const addresses = rows.map((r) => r.address);
  const nicknames = addresses.length > 0 ? getDisplayNamesBatch(addresses) : new Map<string, string>();
  const followerCounts = addresses.length > 0 ? getCachedFollowerCounts(addresses) : new Map<string, number>();
  const genesisPassSet = addresses.length > 0 ? getGenesisPassBatch(addresses) : new Set<string>();
  const profileImages = addresses.length > 0 ? getProfileImagesBatch(addresses) : new Map<string, string>();

  // Resolve xHandles from DynamoDB UserProfiles via identity mapping.
  // SQLite nasun_profiles cache only covers chat-room users; most traders are not in it.
  let xHandlesByAddress = new Map<string, string>();
  if (addresses.length > 0) {
    const identityMap = await resolveIdentityIds(addresses);
    const identityIds = [...new Set(identityMap.values())];
    if (identityIds.length > 0) {
      const handlesByIdentity = await getTwitterHandlesBatch(identityIds);
      for (const [addr, identityId] of identityMap) {
        const handle = handlesByIdentity.get(identityId);
        if (handle) xHandlesByAddress.set(addr, handle);
      }
    }
  }

  const traders = rows.map((row) => ({
    rank: row.rank,
    address: row.address,
    nickname: nicknames.get(row.address) ?? null,
    hasGenesisPass: genesisPassSet.has(row.address),
    profileImageUrl: profileImages.get(row.address) ?? null,
    xHandle: sanitizeXHandle(xHandlesByAddress.get(row.address)),
    totalScore: row.total_score,
    tradeCount: row.trade_count,
    volumeUsd: formatQuoteVolume(row.volume_quote),
    rankChange: row.prev_rank === 0 ? 0 : row.prev_rank - row.rank,
    followerCount: followerCounts.get(row.address) ?? 0,
  }));

  const weekStart = getCurrentWeekStart();
  res.writeHead(200, {
    ...corsHeaders,
    'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
  });
  res.end(JSON.stringify({
    scope: 'weekly',
    weekId,
    weekStart,
    traders,
    updatedAt: getPadoAggregatorLastRun(),
    totalTraders,
  }));
}

function handleTraderScore(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>, address: string,
): boolean {
  const scope = url.searchParams.get('scope') || 'weekly';
  if (!VALID_SCORE_SCOPES.has(scope)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({
      error: `scope '${scope}' not supported`,
      supported: Array.from(VALID_SCORE_SCOPES),
    }));
    return true;
  }

  const nickname = getDisplayName(address);
  const responseHeaders = {
    ...corsHeaders,
    'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
  };

  if (scope === 'alltime') {
    const row = getTraderScore(address);
    if (!row) {
      res.writeHead(200, responseHeaders);
      res.end(JSON.stringify({
        address, nickname, totalScore: 0,
        breakdown: { trades: 0, volume: 0, diversity: 0, pnl: 0 },
        rank: 0, scope,
      }));
      return true;
    }
    res.writeHead(200, responseHeaders);
    res.end(JSON.stringify({
      address, nickname,
      totalScore: row.total_points,
      breakdown: {
        trades: row.points_from_trades,
        volume: row.points_from_volume,
        diversity: row.points_from_diversity,
        pnl: row.points_from_pnl ?? 0,
      },
      rank: row.rank,
      scope,
    }));
    return true;
  }

  // weekly scope
  const weekId = url.searchParams.get('weekId') || getWeekId(getCurrentWeekStart());
  const row = getTraderWeeklyScore(weekId, address);
  if (!row) {
    res.writeHead(200, responseHeaders);
    res.end(JSON.stringify({
      address, nickname, totalScore: 0,
      breakdown: { trades: 0, volume: 0, diversity: 0, pnl: 0 },
      rank: 0, scope, weekId,
    }));
    return true;
  }
  res.writeHead(200, responseHeaders);
  res.end(JSON.stringify({
    address, nickname,
    totalScore: row.total_score,
    breakdown: {
      trades: row.score_from_trades,
      volume: row.score_from_volume,
      diversity: row.score_from_diversity,
      pnl: row.score_from_pnl,
    },
    rank: row.rank,
    scope,
    weekId,
  }));
  return true;
}

function handleTrades(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>, address: string,
): boolean {
  const pool = url.searchParams.get('pool') || undefined;
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 200);
  const cursorParam = url.searchParams.get('cursor');
  const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;

  if (pool && !/^0x[a-fA-F0-9]{64}$/.test(pool)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'Invalid pool address' }));
    return true;
  }
  if (cursor !== undefined && (!Number.isFinite(cursor) || cursor < 0)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'Invalid cursor' }));
    return true;
  }

  const { fills, nextCursor, hasMore } = getTraderFillsByAddress(address, { pool, limit, cursor });
  const trades = fills.map((r) => {
    const isTaker = r.taker_address === address;
    const isBid = !!r.taker_is_bid;
    const side = isTaker ? (isBid ? 'buy' : 'sell') : (isBid ? 'sell' : 'buy');
    return {
      id: r.id, tx_digest: r.tx_digest, event_seq: r.event_seq, pool_id: r.pool_id,
      price: r.price, base_quantity: r.base_quantity, quote_quantity: r.quote_quantity,
      taker_is_bid: r.taker_is_bid, side, role: isTaker ? 'taker' : 'maker',
      timestamp_ms: r.timestamp_ms,
    };
  });
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ trades, nextCursor, hasMore }));
  return true;
}

function handleCostBasis(
  res: ServerResponse, corsHeaders: Record<string, string>, address: string,
): boolean {
  const entries = computeCostBasis(address, getPoolBaseDecimals);
  const totalRealizedPnl = entries.reduce((sum, e) => sum + e.realized_pnl, 0);
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({
    entries,
    total_realized_pnl: Math.round(totalRealizedPnl * 100) / 100,
  }));
  return true;
}

function handleOrders(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>, address: string,
): boolean {
  const pool = url.searchParams.get('pool') || undefined;
  const parsedLimit = parseInt(url.searchParams.get('limit') || '100', 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 100, 1), 200);
  const cursorParam = url.searchParams.get('cursor');
  const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;

  if (pool && !/^0x[a-fA-F0-9]{64}$/.test(pool)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'Invalid pool address' }));
    return true;
  }
  if (cursor !== undefined && (!Number.isFinite(cursor) || cursor < 0)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'Invalid cursor' }));
    return true;
  }

  const { events, nextCursor, hasMore } = getOrderEventsByAddress(address, { pool, limit, cursor });
  const { fills } = getTraderFillsByAddress(address, { pool, limit: 200 });
  const fillsWithRole = fills.map(f => ({
    tx_digest: f.tx_digest, event_seq: f.event_seq, pool_id: f.pool_id,
    maker_order_id: f.maker_order_id ?? null, taker_order_id: f.taker_order_id ?? null,
    price: f.price, base_quantity: f.base_quantity, quote_quantity: f.quote_quantity,
    taker_is_bid: f.taker_is_bid, timestamp_ms: f.timestamp_ms,
    is_maker: f.maker_address === address, is_taker: f.taker_address === address,
  }));
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ events, fills: fillsWithRole, nextCursor, hasMore }));
  return true;
}

// ===== Competition handlers =====

function handleCompetitionList(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>,
): boolean {
  const statusFilter = url.searchParams.get('status') as CompetitionStatus | null;
  const validStatuses = new Set(['upcoming', 'active', 'ended']);
  const competitions = (statusFilter && validStatuses.has(statusFilter))
    ? listCompetitions(statusFilter) : listCompetitions();
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ competitions }));
  return true;
}

function handleCompetitionDetail(
  res: ServerResponse, corsHeaders: Record<string, string>, compId: string,
): boolean {
  const comp = getCompetition(compId);
  if (!comp) {
    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: 'Competition not found' }));
    return true;
  }
  const results = getCompetitionResults(compId, 10);
  const addresses = results.map((r) => r.address);
  const nicknames = addresses.length > 0 ? getDisplayNamesBatch(addresses) : new Map();
  const topTraders = results.map((r) => ({
    rank: r.rank, address: r.address,
    nickname: nicknames.get(r.address) ?? null,
    volumeUsd: formatQuoteVolume(r.volume_quote), tradeCount: r.trade_count,
  }));
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ ...comp, topTraders }));
  return true;
}

function handleCompetitionResults(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>, compId: string,
): boolean {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 200);
  const comp = getCompetition(compId);
  if (!comp) {
    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: 'Competition not found' }));
    return true;
  }
  const results = getCompetitionResults(compId, limit);
  const addresses = results.map((r) => r.address);
  const nicknames = addresses.length > 0 ? getDisplayNamesBatch(addresses) : new Map();
  const traders = results.map((r) => ({
    rank: r.rank, address: r.address,
    nickname: nicknames.get(r.address) ?? null,
    volumeUsd: formatQuoteVolume(r.volume_quote), tradeCount: r.trade_count,
  }));
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ competitionId: compId, traders }));
  return true;
}

function handleCompetitionCreate(
  req: IncomingMessage, res: ServerResponse,
  corsHeaders: Record<string, string>, config: ChatServerConfig,
): void {
  if (!checkAdminAuth(req, config.competitionAdminKey)) {
    res.writeHead(401, corsHeaders);
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  collectBody(req).then((body) => {
    try {
      const data = JSON.parse(body);
      const { title, description, startMs, endMs, prizeDescription, minVolume } = data;
      const parsedStartMs = Number(startMs);
      const parsedEndMs = Number(endMs);

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Title is required' }));
        return;
      }
      if (!Number.isFinite(parsedStartMs) || !Number.isFinite(parsedEndMs)
          || parsedStartMs <= 0 || parsedEndMs <= parsedStartMs) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid start/end time' }));
        return;
      }

      const id = randomBytes(12).toString('hex');
      const now = Date.now();
      const status = now >= parsedStartMs && now <= parsedEndMs ? 'active' : now < parsedStartMs ? 'upcoming' : 'ended';

      createCompetition({
        id,
        title: String(title).slice(0, 100),
        description: String(description || '').slice(0, 500),
        start_ms: parsedStartMs,
        end_ms: parsedEndMs,
        status: status as CompetitionStatus,
        prize_description: String(prizeDescription || '').slice(0, 200),
        min_volume: String(minVolume || '0'),
      });

      res.writeHead(201, corsHeaders);
      res.end(JSON.stringify({ id, status }));
    } catch (err) {
      console.error('[Competition] Create error:', (err as Error).message);
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid request body' }));
    }
  }).catch((err) => {
    console.error('[Competition] Body error:', (err as Error).message);
    res.writeHead(413, corsHeaders);
    res.end(JSON.stringify({ error: 'Request body too large or malformed' }));
  });
}

function handleCompetitionUpdate(
  req: IncomingMessage, res: ServerResponse,
  corsHeaders: Record<string, string>, config: ChatServerConfig, compId: string,
): void {
  if (!checkAdminAuth(req, config.competitionAdminKey)) {
    res.writeHead(401, corsHeaders);
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  collectBody(req).then((body) => {
    try {
      const data = JSON.parse(body);
      const updates: Partial<Pick<CompetitionRow, 'title' | 'description' | 'start_ms' | 'end_ms' | 'status' | 'prize_description' | 'min_volume'>> = {};

      if (data.title !== undefined) updates.title = String(data.title).slice(0, 100);
      if (data.description !== undefined) updates.description = String(data.description).slice(0, 500);
      if (data.startMs !== undefined) {
        const n = Number(data.startMs);
        if (!Number.isFinite(n) || n <= 0) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'Invalid startMs' })); return; }
        updates.start_ms = n;
      }
      if (data.endMs !== undefined) {
        const n = Number(data.endMs);
        if (!Number.isFinite(n) || n <= 0) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'Invalid endMs' })); return; }
        updates.end_ms = n;
      }
      if (data.status !== undefined) {
        const validStatuses = new Set(['upcoming', 'active', 'ended']);
        if (!validStatuses.has(data.status)) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'Invalid status' })); return; }
        updates.status = data.status;
      }
      if (data.prizeDescription !== undefined) updates.prize_description = String(data.prizeDescription).slice(0, 200);
      if (data.minVolume !== undefined) updates.min_volume = String(data.minVolume);

      const ok = updateCompetition(compId, updates);
      if (!ok) {
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ error: 'Competition not found' }));
        return;
      }
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('[Competition] Update error:', (err as Error).message);
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid request body' }));
    }
  }).catch((err) => {
    console.error('[Competition] Body error:', (err as Error).message);
    res.writeHead(413, corsHeaders);
    res.end(JSON.stringify({ error: 'Request body too large or malformed' }));
  });
}

