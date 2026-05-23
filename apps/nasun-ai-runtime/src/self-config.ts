/**
 * Self-config enabled gate (Phase 1 of agent config single-source-of-truth refactor).
 *
 * Before each trader cycle, ask chat-server "is this agent still enabled?"
 * and exit cleanly when the answer is no. This is the defense-in-depth
 * safety net so that user intent (enabled:false in chat-server SQLite) is
 * honored within at most one cycle, even if the orchestrator side fails
 * to issue `pm2 stop` for any reason.
 *
 * Auth: HMAC over the lowercase agent address bytes. Mirrors the chat-server
 * `GET /api/nasun-ai/config/:agentAddress` runtime path
 * (apps/nasun-website/chat-server/src/nasun-ai-config-routes.ts:332).
 *
 * Failure semantics: fail-open. If chat-server is unreachable or returns
 * 5xx/auth errors, the agent keeps running. Rationale: a transient network
 * partition shouldn't kill a healthy agent, and the orchestrator side
 * (Phase 6) will be fail-closed at spawn time. Only definitive negative
 * answers (404 + enabled:false) trigger exit.
 *
 * Single-daemon / standalone mode (no CHAT_SERVER_BASE_URL): no-op. The
 * standalone daemon is operator-controlled; remote disable is not its model.
 */

import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export interface AssertEnabledOptions {
  /** chat-server base URL, e.g. "https://nasun.io/chat" or "" to disable check. */
  chatServerBaseUrl: string;
  /** Agent ed25519 address (Sui hex). Will be lowercased. */
  agentAddress: string;
  /** Hex-encoded HMAC secret. Falls back to BARAM_CHAT_SERVER_HMAC_SECRET env. */
  hmacSecretHex?: string;
  /** Fetch implementation (for tests). */
  fetchImpl?: typeof fetch;
  /** process.exit implementation (for tests). */
  exitImpl?: (code: number) => never;
  /** Log line sink. */
  log?: (msg: string) => void;
  /** Request timeout in ms. */
  timeoutMs?: number;
  /**
   * PM2 process name to administratively stop before exit (override).
   * Defaults to process.env.PM2_AGENT_NAME. Set to '' to skip pm2 stop
   * even when the env var is present (mostly for tests).
   */
  pm2Name?: string;
  /**
   * Synchronous pm2 stop invoker (for tests). Defaults to spawnSync('pm2', ['stop', name]).
   * Should return { ok: boolean }.
   */
  pm2StopImpl?: (pm2Name: string) => { ok: boolean };
}

export interface SelfConfigCheckResult {
  /** What action the function decided. */
  decision: 'continue' | 'exit' | 'skip';
  /** Human-readable reason logged alongside the decision. */
  reason: string;
}

/**
 * Fetch self config and exit(0) if the agent is disabled or no longer
 * configured on chat-server. Returns void; callers should treat return as
 * "continue normally".
 *
 * Decision matrix:
 *   - no chatServerBaseUrl     -> skip (standalone mode)
 *   - no hmacSecret            -> skip + warn (mis-configured but fail-open)
 *   - HTTP 200 + enabled:true  -> continue
 *   - HTTP 200 + enabled:false -> exit(0)
 *   - HTTP 404                 -> exit(0) (server intentionally has no row)
 *   - HTTP 401/403             -> skip + warn (auth drift; do not loop on bad creds)
 *   - HTTP 5xx                 -> skip + warn (server flaky; orchestrator handles)
 *   - fetch throw / timeout    -> skip + warn (network flake; orchestrator handles)
 */
/**
 * Default synchronous pm2 stop implementation. Tells pm2 to mark this
 * process as administratively stopped so it does NOT autorestart on the
 * subsequent process.exit. Without this, ecosystem template's
 * `autorestart: true` interprets exit(0) as a crash and respawns
 * indefinitely (bouncing every few seconds, 2026-05-23 deploy regression).
 */
function defaultPm2Stop(pm2Name: string): { ok: boolean } {
  const result = spawnSync('pm2', ['stop', pm2Name], {
    timeout: 10_000,
    stdio: 'ignore',
  });
  return { ok: result.status === 0 };
}

export async function assertEnabledOrExit(opts: AssertEnabledOptions): Promise<SelfConfigCheckResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const fetchFn = opts.fetchImpl ?? fetch;
  const hmacSecret = opts.hmacSecretHex ?? process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pm2Name = opts.pm2Name ?? process.env.PM2_AGENT_NAME ?? '';
  const pm2StopFn = opts.pm2StopImpl ?? defaultPm2Stop;

  // Wrap exit to first ask pm2 to stop us, so pm2 sees an admin stop +
  // exit, not a crash. Fall through to process.exit if pm2 stop fails
  // or no pm2 name is known (standalone dev runs).
  const exit = (code: number): never => {
    if (pm2Name) {
      log(`[enabled-check] pm2 stop ${pm2Name} (suppress autorestart) ...`);
      const stop = pm2StopFn(pm2Name);
      log(`[enabled-check] pm2 stop ${pm2Name} ${stop.ok ? 'ok' : 'failed'}`);
    }
    if (opts.exitImpl) return opts.exitImpl(code);
    return process.exit(code);
  };

  if (!opts.chatServerBaseUrl) {
    return { decision: 'skip', reason: 'no chat-server configured (standalone mode)' };
  }
  if (!hmacSecret || hmacSecret.length < 32) {
    const reason = 'BARAM_CHAT_SERVER_HMAC_SECRET missing or too short; cannot authenticate';
    log(`[enabled-check] ${reason}; skipping (fail-open)`);
    return { decision: 'skip', reason };
  }

  const addr = opts.agentAddress.toLowerCase();
  const url = `${opts.chatServerBaseUrl.replace(/\/$/, '')}/api/nasun-ai/config/${addr}`;
  const hmac = createHmac('sha256', Buffer.from(hmacSecret, 'hex'))
    .update(Buffer.from(addr, 'utf8'))
    .digest('hex');

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers: { 'X-HMAC': hmac },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = `fetch error: ${err instanceof Error ? err.message : String(err)}`;
    log(`[enabled-check] ${reason}; skipping (fail-open)`);
    return { decision: 'skip', reason };
  }

  if (res.status === 404) {
    const reason = 'server returned 404 (no config row); intent says do not run';
    log(`[enabled-check] ${reason}. Exiting.`);
    exit(0);
    return { decision: 'exit', reason };
  }
  if (res.status === 401 || res.status === 403) {
    const reason = `HTTP ${res.status} (auth drift); cannot determine state`;
    log(`[enabled-check] ${reason}; skipping (fail-open)`);
    return { decision: 'skip', reason };
  }
  if (!res.ok) {
    const reason = `HTTP ${res.status}`;
    log(`[enabled-check] ${reason}; skipping (fail-open)`);
    return { decision: 'skip', reason };
  }

  let body: { config?: { enabled?: unknown } };
  try {
    body = await res.json() as { config?: { enabled?: unknown } };
  } catch (err) {
    const reason = `JSON parse error: ${err instanceof Error ? err.message : String(err)}`;
    log(`[enabled-check] ${reason}; skipping (fail-open)`);
    return { decision: 'skip', reason };
  }

  if (body?.config?.enabled !== true) {
    const reason = `server config has enabled !== true (got ${JSON.stringify(body?.config?.enabled)})`;
    log(`[enabled-check] ${reason}. Exiting.`);
    exit(0);
    return { decision: 'exit', reason };
  }

  return { decision: 'continue', reason: 'enabled:true' };
}
