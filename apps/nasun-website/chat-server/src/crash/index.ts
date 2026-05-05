import { fork, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
import type { CrashModuleDeps, WsEvent, RoundState, RecentRound, ResolvePlayerRow } from './types.js';
import { PARENT_GRACE_MS } from './constants.js';
import type { WebSocket } from 'ws';
import type { IncomingMessage, ServerResponse } from 'node:http';

const CRASH_CHANNEL = 'crash';
const crashClients = new Set<WebSocket>();

// Snapshot mirrors child round-manager's InternalRoundState. Updated via IPC events.
interface SnapshotState {
  state: RoundState;
  roundId: number | null;
  roundObjectId: string | null;
  commitHash: string | null;
  bettingEndsAt: number | null;
  flyingStartedAt: number | null;
  nextRoundAt: number | null;
  recentRounds: RecentRound[];
  crashedAlreadyFired: boolean;
  stateVersion: number;
}

let snapshot: SnapshotState = createInitialSnapshot();
let child: ChildProcess | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

// ===== History DB (parent-owned, read+write single owner) =====
//
// Design: keeper child sends parsed `resolve_persisted` events via IPC; parent
// performs INSERT here. Single-process writer avoids better-sqlite3 multi-FD
// coordination concerns. Schema initialized at module start (before child fork)
// so the file always exists when the first IPC arrives.
let historyDb: Database.Database | null = null;
let insertPlayerStmt: Database.Statement | null = null;
let queryHistoryStmt: Database.Statement | null = null;
let queryHistoryBeforeStmt: Database.Statement | null = null;

const HISTORY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS crash_player_results (
    round_id        INTEGER NOT NULL,
    player          TEXT    NOT NULL,
    bet_amount      TEXT    NOT NULL,
    payout          TEXT    NOT NULL,
    multiplier_bps  INTEGER NOT NULL,
    timestamp_ms    INTEGER NOT NULL,
    session_id_hex  TEXT    NOT NULL,
    resolve_tx      TEXT    NOT NULL,
    bet_tx          TEXT,
    PRIMARY KEY (round_id, player)
  );
  CREATE INDEX IF NOT EXISTS idx_player_round ON crash_player_results (player, round_id DESC);
`;

// Idempotent ALTER for DBs created before bet_tx existed. SQLite has no
// IF NOT EXISTS for ADD COLUMN, so guard via PRAGMA.
function ensureBetTxColumn(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info('crash_player_results')").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'bet_tx')) {
    db.exec("ALTER TABLE crash_player_results ADD COLUMN bet_tx TEXT");
  }
}

function openHistoryDb(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (err) {
    console.error('[Crash] history db parent dir create failed', err);
  }
  historyDb = new Database(path);
  historyDb.pragma('journal_mode = WAL');
  historyDb.pragma('synchronous = NORMAL');
  historyDb.exec(HISTORY_SCHEMA);
  ensureBetTxColumn(historyDb);
  insertPlayerStmt = historyDb.prepare(`
    INSERT OR REPLACE INTO crash_player_results
    (round_id, player, bet_amount, payout, multiplier_bps, timestamp_ms, session_id_hex, resolve_tx, bet_tx)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  queryHistoryStmt = historyDb.prepare(`
    SELECT round_id, bet_amount, payout, multiplier_bps, timestamp_ms, resolve_tx, bet_tx
    FROM crash_player_results
    WHERE player = ?
    ORDER BY round_id DESC
    LIMIT ?
  `);
  queryHistoryBeforeStmt = historyDb.prepare(`
    SELECT round_id, bet_amount, payout, multiplier_bps, timestamp_ms, resolve_tx, bet_tx
    FROM crash_player_results
    WHERE player = ? AND round_id < ?
    ORDER BY round_id DESC
    LIMIT ?
  `);
}

function persistResolveRows(roundId: number, resolveTx: string, rows: ResolvePlayerRow[]): void {
  if (!historyDb || !insertPlayerStmt) return;
  const stmt = insertPlayerStmt;
  try {
    const tx = historyDb.transaction((batch: ResolvePlayerRow[]) => {
      for (const r of batch) {
        stmt.run(
          roundId,
          r.player,
          r.betAmount,
          r.payout,
          r.multiplierBps,
          r.timestampMs,
          r.sessionIdHex,
          resolveTx,
          r.betTx,
        );
      }
    });
    tx(rows);
  } catch (err) {
    console.error('[Crash] persistResolveRows failed', { roundId, err: (err as Error).message });
  }
}

// ===== HTTP rate limit (per-IP, sliding window) =====
//
// Generous to mirror leaderboard-api's 180/min for read-only sqlite endpoints.
// History page may parallel-fetch + refresh; bots/scrapers will trip 429.
const HISTORY_RATE_MAX = 120;
const HISTORY_RATE_WINDOW_MS = 60_000;
// Hard cap on map size as a defense-in-depth against pathological IP churn
// (CG-NAT rotation, scrapers). When exceeded, evict the oldest entries.
const HISTORY_RATE_MAP_MAX = 10_000;
const HISTORY_RATE_SWEEP_MS = 5 * 60_000;
const historyRateMap = new Map<string, { count: number; resetAt: number }>();

function checkHistoryRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = historyRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    if (historyRateMap.size >= HISTORY_RATE_MAP_MAX) {
      // Evict oldest insertion (Map preserves insertion order). Cheap O(1)
      // bound when sweep can't keep up with adversarial churn.
      const firstKey = historyRateMap.keys().next().value;
      if (firstKey !== undefined) historyRateMap.delete(firstKey);
    }
    historyRateMap.set(ip, { count: 1, resetAt: now + HISTORY_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= HISTORY_RATE_MAX) return false;
  entry.count++;
  return true;
}

// Periodic sweep removes entries whose window has expired. Prevents the map
// from accumulating one-shot IPs across the PM2 restart interval.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of historyRateMap) {
    if (now > entry.resetAt) historyRateMap.delete(ip);
  }
}, HISTORY_RATE_SWEEP_MS).unref();

function getClientIp(req: IncomingMessage): string {
  // Trust the rightmost X-Forwarded-For hop: nginx appends the real client IP
  // via $proxy_add_x_forwarded_for, so anything to its left is client-supplied
  // and spoofable. Falls back to socket address for direct connections.
  const xff = req.headers['x-forwarded-for'] as string | undefined;
  if (xff) {
    const parts = xff.split(',');
    const ip = parts[parts.length - 1]?.trim();
    if (ip) return ip;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

// A-C1 backoff
const exitHistory: number[] = [];
const BACKOFF_WINDOW_MS = 60_000;
const BACKOFF_MAX_EXITS = 5;
const BACKOFF_LONG_WAIT_MS = 30 * 60_000;
const RESTART_BASE_MS = 5_000;

// Boot-block (code=2) exponential backoff: 60s, 5min, 30min, 1h cap.
let bootBlockCount = 0;
const BOOT_BLOCK_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 60 * 60_000];

// Send a plain-text Slack notification if CRASH_ALERT_WEBHOOK_URL is set.
// Failures are non-fatal: logged at warn level, never throw.
function sendSlackAlert(logger: CrashModuleDeps['logger'], text: string): void {
  const url = process.env.CRASH_ALERT_WEBHOOK_URL;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch((err: unknown) => logger.warn(`[Crash] Slack alert failed: ${(err as Error).message}`));
}

function createInitialSnapshot(): SnapshotState {
  return {
    state: 'IDLE',
    roundId: null,
    roundObjectId: null,
    commitHash: null,
    bettingEndsAt: null,
    flyingStartedAt: null,
    nextRoundAt: null,
    recentRounds: [],
    crashedAlreadyFired: false,
    stateVersion: Date.now(),
  };
}

export async function startCrashModule({ wsServer, logger }: CrashModuleDeps): Promise<void> {
  if (process.env.CRASH_ENABLED !== 'true') {
    logger.info('[Crash] disabled (CRASH_ENABLED != "true")');
    return;
  }
  if (!process.env.CRASH_OPERATOR_PRIVKEY) {
    logger.error('[Crash] CRASH_OPERATOR_PRIVKEY missing, abort');
    return;
  }
  if (!process.env.CRASH_PKG || !process.env.CRASH_REGISTRY) {
    logger.error('[Crash] CRASH_PKG / CRASH_REGISTRY missing, abort');
    return;
  }

  const dbPath = process.env.CRASH_SALT_DB_PATH ?? '/tmp/nasun-crash-salts.sqlite';
  try {
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  } catch (err) {
    logger.error(`[Crash] sqlite parent dir create failed: ${(err as Error).message}`);
    return;
  }

  // Open history DB before forking child so the schema is ready when the
  // first resolve_persisted IPC arrives. Parent owns this DB end-to-end.
  const historyDbPath = process.env.CRASH_HISTORY_DB_PATH ?? '/tmp/nasun-crash-history.sqlite';
  try {
    openHistoryDb(historyDbPath);
  } catch (err) {
    // Non-fatal: history endpoint will return 503; round flow unaffected.
    logger.error(`[Crash] history db open failed: ${(err as Error).message}`);
  }

  // WS subscribe handler
  wsServer.on('connection', (ws: WebSocket) => {
    function onMessage(raw: import('ws').RawData) {
      let msg: { channel?: string; type?: string };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.channel !== CRASH_CHANNEL) return;
      if (msg.type === 'subscribe') {
        crashClients.add(ws);
        ws.send(JSON.stringify({
          channel: CRASH_CHANNEL,
          type: 'state_sync',
          ...snapshot,
          serverTime: Date.now(),
        }));
      } else if (msg.type === 'unsubscribe') {
        crashClients.delete(ws);
      }
    }
    ws.on('message', onMessage);
    const cleanup = () => {
      crashClients.delete(ws);
      ws.off('message', onMessage);
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  spawnChild(logger);
  logger.info('[Crash] module started (child fork mode)');
}

function spawnChild(logger: CrashModuleDeps['logger']) {
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }

  // dist/crash/index.js와 같은 디렉토리의 child-entry.js (compiled)
  const childPath = resolvePath(__dirname, 'child-entry.js');

  child = fork(childPath, [], {
    env: {
      // F-C3: process.env 전체 통과 (HOME, NODE_OPTIONS, native binding 의존성)
      ...process.env,
      NODE_ENV: 'production',
    },
    silent: false,
    serialization: 'json',
  });

  child.on('message', (event: WsEvent) => {
    try {
      // Persist to history DB AND broadcast so clients can confirm per-player
      // payouts. Without the broadcast, the frontend would celebrate any
      // successful cash_out tx as a win, even when the onchain resolve check
      // (recorded_at <= crash_deadline) invalidates the cashout post-hoc.
      if (event.type === 'resolve_persisted') {
        persistResolveRows(event.roundId, event.resolveTx, event.rows);
        broadcast(event);
        return;
      }
      applyEvent(event);
      broadcast(event);
    } catch (err) {
      logger.warn(`[crash-parent] applyEvent error: ${(err as Error).message}`);
    }
  });

  child.on('exit', (code, signal) => {
    logger.warn(`[crash-child] exited code=${code} signal=${signal}`);
    child = null;

    // Tripwire: if the child died mid-round, the parent snapshot retains
    // stale state (roundId, flyingStartedAt, etc.) until the next
    // round_started IPC arrives from the respawned child. Reconnecting
    // clients during that window receive stale state_sync. Log at error
    // level so we know if/when this actually happens in prod — fix is
    // deferred until evidence exists.
    if (snapshot.state === 'BETTING' || snapshot.state === 'FLYING' || snapshot.state === 'CRASHED') {
      logger.error(`[CRASH STALE-SNAPSHOT] child died mid-round, parent snapshot is now stale until next round_started: state=${snapshot.state} roundId=${snapshot.roundId} flyingStartedAt=${snapshot.flyingStartedAt}`);
    }

    // Exit code 2 = boot-blocked (stale round in registry). Don't count as crash.
    // Exit code 2 = boot-blocked (entries>0 stuck round in registry).
    // Exponential backoff: 60s, 5min, 30min, 1h cap to avoid hot loop while
    // waiting for manual emergency_refund_batch + admin_finalize.
    if (code === 2) {
      bootBlockCount++;
      const delayMs = BOOT_BLOCK_DELAYS_MS[Math.min(bootBlockCount - 1, BOOT_BLOCK_DELAYS_MS.length - 1)];
      logger.warn(`[Crash] Boot-blocked (attempt ${bootBlockCount}) — retrying in ${delayMs / 1000}s. Clear stuck round to unblock.`);
      broadcast({
        type: 'disabled',
        reason: 'boot_blocked',
        retryAt: Date.now() + delayMs,
        stateVersion: ++snapshot.stateVersion,
      });
      sendSlackAlert(logger, `[Crash] Boot-blocked (attempt ${bootBlockCount}), retry in ${delayMs / 1000}s — stuck round in registry, needs emergency_refund_batch + admin_finalize.`);
      restartTimer = setTimeout(() => spawnChild(logger), delayMs);
      return;
    }

    const now = Date.now();
    exitHistory.push(now);
    while (exitHistory.length > 0 && now - exitHistory[0] > BACKOFF_WINDOW_MS) {
      exitHistory.shift();
    }

    if (exitHistory.length >= BACKOFF_MAX_EXITS) {
      logger.error(`[CRASH CRITICAL] child crash loop detected (${exitHistory.length} exits in ${BACKOFF_WINDOW_MS}ms). Backing off ${BACKOFF_LONG_WAIT_MS}ms. Manual intervention required.`);
      sendSlackAlert(logger, `[Crash] CRITICAL: crash loop (${exitHistory.length} exits/${BACKOFF_WINDOW_MS / 1000}s). Backing off ${BACKOFF_LONG_WAIT_MS / 60000}min. Manual intervention required.`);
      // A-W1: 사용자에게 disabled 상태 명시 broadcast
      const disabledEvent: WsEvent = {
        type: 'disabled',
        reason: 'backoff',
        retryAt: now + BACKOFF_LONG_WAIT_MS,
        stateVersion: ++snapshot.stateVersion,
      };
      broadcast(disabledEvent);
      restartTimer = setTimeout(() => {
        exitHistory.length = 0;
        spawnChild(logger);
      }, BACKOFF_LONG_WAIT_MS);
    } else {
      restartTimer = setTimeout(() => spawnChild(logger), RESTART_BASE_MS);
    }
  });

  child.on('error', (err) => {
    logger.error(`[crash-parent] fork error: ${err.message}`);
  });
}

function applyEvent(event: WsEvent) {
  snapshot.stateVersion = event.stateVersion;
  switch (event.type) {
    case 'round_started':
      snapshot.state = 'BETTING';
      snapshot.roundId = event.roundId;
      snapshot.roundObjectId = event.roundObjectId;
      snapshot.commitHash = event.commitHash;
      snapshot.bettingEndsAt = event.bettingEndsAt;
      snapshot.flyingStartedAt = null;
      snapshot.nextRoundAt = null;
      snapshot.crashedAlreadyFired = false;
      bootBlockCount = 0;  // child recovered successfully
      break;
    case 'betting_closed':
      snapshot.state = 'FLYING';
      snapshot.flyingStartedAt = event.flyingStartedAt;
      break;
    case 'crashed':
      snapshot.state = 'CRASHED';
      snapshot.crashedAlreadyFired = true;
      break;
    case 'resolved':
      snapshot.state = 'RESOLVED';
      snapshot.nextRoundAt = event.nextRoundAt;
      snapshot.recentRounds = [
        { roundId: event.roundId, crashPointBps: event.crashPointBps },
        ...snapshot.recentRounds.slice(0, 19),
      ];
      // round-manager는 RESOLVED 후 IDLE 전환을 별도 이벤트로 안 보냄.
      // 다음 round_started까지 RESOLVED 유지 (UI는 recentRounds[0]로 표시).
      break;
    case 'disabled':
      // 표시용. snapshot 상태 변경 없음 (round 진행과 독립).
      break;
  }
}

function broadcast(event: WsEvent) {
  const msg = JSON.stringify({ channel: CRASH_CHANNEL, ...event });
  for (const ws of crashClients) {
    try {
      if (ws.readyState === (ws as WebSocket & { OPEN: number }).OPEN) {
        ws.send(msg);
      }
    } catch {}
  }
}

export function handleCrashHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  corsHeaders: Record<string, string>,
): boolean {
  const url = new URL(req.url ?? '/', `http://localhost`);
  if (url.pathname === '/api/crash/current-round' && req.method === 'GET') {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ ...snapshot, serverTime: Date.now() }));
    return true;
  }
  if (url.pathname === '/api/crash/history' && req.method === 'GET') {
    return handleHistoryRequest(req, url, res, corsHeaders);
  }
  return false;
}

// Sui address: 0x + 64 lowercased hex chars. Strict — no padding.
const SUI_ADDRESS_RE = /^0x[0-9a-f]{64}$/;

function handleHistoryRequest(
  req: IncomingMessage,
  url: URL,
  res: ServerResponse,
  corsHeaders: Record<string, string>,
): boolean {
  if (!checkHistoryRateLimit(getClientIp(req))) {
    res.writeHead(429, corsHeaders);
    res.end(JSON.stringify({ error: 'rate_limited' }));
    return true;
  }
  if (!historyDb || !queryHistoryStmt || !queryHistoryBeforeStmt) {
    res.writeHead(503, corsHeaders);
    res.end(JSON.stringify({ error: 'history_unavailable' }));
    return true;
  }

  const address = (url.searchParams.get('address') ?? '').toLowerCase();
  if (!SUI_ADDRESS_RE.test(address)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'invalid_address' }));
    return true;
  }
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
  const beforeRaw = url.searchParams.get('before');
  const before = beforeRaw ? parseInt(beforeRaw, 10) : null;

  let rows: unknown[];
  try {
    rows = (before != null && Number.isFinite(before))
      ? queryHistoryBeforeStmt.all(address, before, limit)
      : queryHistoryStmt.all(address, limit);
  } catch (err) {
    console.error('[Crash] history query failed', err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'query_failed' }));
    return true;
  }

  // Short cache: tolerates browser-back/forward without serving stale wins.
  // Vary on query string already implicit via URL — verify nginx config keys
  // include query string before relaxing this.
  res.writeHead(200, { ...corsHeaders, 'Cache-Control': 'private, max-age=5' });
  res.end(JSON.stringify({ items: rows, serverTime: Date.now() }));
  return true;
}

/// chat-server SIGTERM 시 호출. child SIGTERM + exit 16s 대기. 그 후 SIGKILL fallback.
export async function stopCrashModule(): Promise<void> {
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  if (!child) return;
  const c = child;
  child = null;
  exitHistory.length = 0;  // shutdown 의도라 backoff 리셋
  try {
    c.kill('SIGTERM');
    await Promise.race([
      once(c, 'exit'),
      new Promise((resolve) => setTimeout(resolve, PARENT_GRACE_MS)),
    ]);
  } catch {}
  if (!c.killed) {
    try { c.kill('SIGKILL'); } catch {}
  }
  try { historyDb?.close(); } catch {}
  historyDb = null;
  insertPlayerStmt = null;
  queryHistoryStmt = null;
  queryHistoryBeforeStmt = null;
}
