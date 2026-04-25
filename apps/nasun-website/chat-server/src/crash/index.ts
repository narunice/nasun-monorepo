import { fork, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const __dirname = dirname(fileURLToPath(import.meta.url));
import type { CrashModuleDeps, WsEvent, RoundState, RecentRound } from './types.js';
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
  recentRounds: RecentRound[];
  crashedAlreadyFired: boolean;
  stateVersion: number;
}

let snapshot: SnapshotState = createInitialSnapshot();
let child: ChildProcess | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

// A-C1 backoff
const exitHistory: number[] = [];
const BACKOFF_WINDOW_MS = 60_000;
const BACKOFF_MAX_EXITS = 5;
const BACKOFF_LONG_WAIT_MS = 30 * 60_000;
const RESTART_BASE_MS = 5_000;

function createInitialSnapshot(): SnapshotState {
  return {
    state: 'IDLE',
    roundId: null,
    roundObjectId: null,
    commitHash: null,
    bettingEndsAt: null,
    flyingStartedAt: null,
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
      applyEvent(event);
      broadcast(event);
    } catch (err) {
      logger.warn(`[crash-parent] applyEvent error: ${(err as Error).message}`);
    }
  });

  child.on('exit', (code, signal) => {
    logger.warn(`[crash-child] exited code=${code} signal=${signal}`);
    child = null;

    const now = Date.now();
    exitHistory.push(now);
    while (exitHistory.length > 0 && now - exitHistory[0] > BACKOFF_WINDOW_MS) {
      exitHistory.shift();
    }

    if (exitHistory.length >= BACKOFF_MAX_EXITS) {
      logger.error(`[CRASH CRITICAL] child crash loop detected (${exitHistory.length} exits in ${BACKOFF_WINDOW_MS}ms). Backing off ${BACKOFF_LONG_WAIT_MS}ms. Manual intervention required.`);
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
      snapshot.crashedAlreadyFired = false;
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
  if (url.pathname !== '/api/crash/current-round' || req.method !== 'GET') return false;
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ ...snapshot, serverTime: Date.now() }));
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
      new Promise((resolve) => setTimeout(resolve, 16000)),
    ]);
  } catch {}
  if (!c.killed) {
    try { c.kill('SIGKILL'); } catch {}
  }
}
