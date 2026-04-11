/**
 * Leaderboard REST API handler module.
 * Separated from server.ts for maintainability and extensibility.
 * All endpoints are conditionally enabled via DEEPBOOK_PACKAGE env var.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ChatServerConfig } from './types.js';
import { getDisplayName, getDisplayNamesBatch, getFollowing, getFollowerCounts, getGenesisPassBatch } from './store.js';
import { getPoolSymbol, getPoolBaseDecimals } from './rooms.js';
import {
  getLeaderboard, getLeaderboardPnl,
  getTraderAllPeriodStats, getTraderFills,
  getTotalFillsCount, getTotalTradersCount, getTotalPnlTradersCount,
  getIndexerState,
  getPointsLeaderboard, getTraderPoints, getTotalPointsTraders,
  getPointsSnapshot, getPointsRankHistory, getSnapshotDates, getSnapshotTotalTraders,
  generatePointsSnapshot,
  getTraderFillsByAddress, computeCostBasis,
  getOrderEventsByAddress,
  getFollowedTraderFills,
  createCompetition, updateCompetition, getCompetition, listCompetitions,
  getCompetitionResults,
} from './leaderboard-store.js';
import { VALID_PERIODS, VALID_MODES } from './leaderboard-types.js';
import type { CompetitionStatus, CompetitionRow } from './leaderboard-types.js';

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
  const method = req.method || 'GET';

  // Only handle known API prefixes
  if (!pathname.startsWith('/api/leaderboard') &&
      !pathname.startsWith('/api/trades') &&
      !pathname.startsWith('/api/orders') &&
      !pathname.startsWith('/api/competitions') &&
      pathname !== '/api/feed') {
    return false;
  }

  // Handle OPTIONS with appropriate methods per route
  if (method === 'OPTIONS') {
    const needsWrite = pathname.startsWith('/api/competitions') ||
                       pathname === '/api/leaderboard/snapshots/generate';
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
    if (pathname === '/api/leaderboard/points' && method === 'GET') {
      return handlePointsLeaderboard(res, url, corsHeaders);
    }
    if (pathname === '/api/leaderboard/snapshots' && method === 'GET') {
      return handleSnapshots(res, url, corsHeaders);
    }
    if (pathname === '/api/leaderboard/snapshots/dates' && method === 'GET') {
      return handleSnapshotDates(res, url, corsHeaders);
    }
    if (pathname === '/api/leaderboard/snapshots/generate' && method === 'POST') {
      return handleSnapshotGenerate(req, res, url, corsHeaders, config);
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

    const pointsMatch = pathname.match(/^\/api\/leaderboard\/trader\/(0x[a-fA-F0-9]{64})\/points$/);
    if (pointsMatch && method === 'GET') {
      return handleTraderPoints(res, corsHeaders, pointsMatch[1]);
    }

    const snapshotHistoryMatch = pathname.match(/^\/api\/leaderboard\/snapshots\/history\/(0x[a-fA-F0-9]{64})$/);
    if (snapshotHistoryMatch && method === 'GET') {
      return handleSnapshotHistory(res, url, corsHeaders, snapshotHistoryMatch[1]);
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

function handleTraderPoints(
  res: ServerResponse, corsHeaders: Record<string, string>, address: string,
): boolean {
  const points = getTraderPoints(address);
  const traderDisplayName = getDisplayName(address);
  if (!points) {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      address, nickname: traderDisplayName, totalPoints: 0,
      breakdown: { trades: 0, volume: 0, diversity: 0, pnl: 0 }, rank: 0,
    }));
    return true;
  }
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({
    address, nickname: traderDisplayName, totalPoints: points.total_points,
    breakdown: {
      trades: points.points_from_trades, volume: points.points_from_volume,
      diversity: points.points_from_diversity, pnl: points.points_from_pnl ?? 0,
    },
    rank: points.rank,
  }));
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

function handlePointsLeaderboard(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>,
): boolean {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  const rows = getPointsLeaderboard(limit, offset);
  const totalTraders = getTotalPointsTraders();
  const addresses = rows.map((r) => r.address);
  const nicknames = addresses.length > 0 ? getDisplayNamesBatch(addresses) : new Map<string, string>();
  const followerCnts = addresses.length > 0 ? getCachedFollowerCounts(addresses) : new Map();
  const gpSet = addresses.length > 0 ? getGenesisPassBatch(addresses) : new Set<string>();
  const traders = rows.map((row) => ({
    rank: row.rank, address: row.address,
    nickname: nicknames.get(row.address) ?? null,
    hasGenesisPass: gpSet.has(row.address),
    totalPoints: row.total_points, tradeCount: row.trade_count,
    volumeUsd: formatQuoteVolume(row.volume_quote),
    rankChange: row.prev_rank > 0 ? row.prev_rank - row.rank : 0,
    followerCount: followerCnts.get(row.address) ?? 0,
  }));
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ traders, updatedAt: rows[0]?.updated_at ?? 0, totalTraders }));
  return true;
}

function handleSnapshots(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>,
): boolean {
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'Invalid date format. Use: YYYY-MM-DD' }));
    return true;
  }
  const rows = getPointsSnapshot(date, limit, offset);
  const totalTraders = getSnapshotTotalTraders(date);
  const addresses = rows.map((r) => r.address);
  const nicknames = addresses.length > 0 ? getDisplayNamesBatch(addresses) : new Map<string, string>();
  const traders = rows.map((row) => ({
    rank: row.rank, address: row.address,
    nickname: nicknames.get(row.address) ?? null,
    totalPoints: row.total_points,
    breakdown: {
      trades: row.points_from_trades, volume: row.points_from_volume,
      diversity: row.points_from_diversity, pnl: row.points_from_pnl,
    },
    tradeCount: row.trade_count, volumeUsd: formatQuoteVolume(row.volume_quote),
  }));
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ date, traders, totalTraders }));
  return true;
}

function handleSnapshotDates(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>,
): boolean {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10), 1), 365);
  const dates = getSnapshotDates(limit);
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ dates }));
  return true;
}

function handleSnapshotHistory(
  res: ServerResponse, url: URL, corsHeaders: Record<string, string>, address: string,
): boolean {
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10), 1), 365);
  const history = getPointsRankHistory(address, days);
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({
    address,
    history: history.map((h) => ({ date: h.snapshot_date, rank: h.rank, totalPoints: h.total_points })),
  }));
  return true;
}

function handleSnapshotGenerate(
  req: IncomingMessage, res: ServerResponse, url: URL,
  corsHeaders: Record<string, string>, config: ChatServerConfig,
): boolean {
  if (!checkAdminAuth(req, config.competitionAdminKey)) {
    res.writeHead(401, corsHeaders);
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return true;
  }
  const snapshotDate = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'Invalid date format. Use: YYYY-MM-DD' }));
    return true;
  }
  const count = generatePointsSnapshot(snapshotDate);
  if (count === 0) {
    res.writeHead(409, corsHeaders);
    res.end(JSON.stringify({ error: 'Snapshot already exists for this date', date: snapshotDate }));
  } else {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ date: snapshotDate, tradersSnapshotted: count }));
  }
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
