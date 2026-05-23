// Heartbeat → user Telegram push (single-file, no SDK split).
//
// Triggered by trader-runner after each autonomous cycle. Wake-triggered
// cycles do NOT call this — chat-server already replies to the user's
// Telegram message in-band via wake-proxy's HTTP response.
//
// Skip rules (any matching → no fetch):
//   - HEARTBEAT_PUSH_ENABLED env not 'true'
//   - WALLET_ADDRESS unset
//   - outcome != 'succeeded'
//   - decision.action not in {BUY, SELL}
//
// Transport: POST CHAT_SERVER_BASE_URL/api/nasun-ai/agent/push with body
// `{wallet, html}` and X-HMAC header. HMAC input is `"push:" || body` —
// the prefix makes this direction non-replayable against /wake even though
// both share BARAM_CHAT_SERVER_HMAC_SECRET.
//
// Failure handling: best-effort. timeout 8s, no retry, errors swallowed
// with a warn log. The on-chain AER is the SSOT for the agent's actions;
// the Telegram push is a notification convenience.

import { createHmac } from 'node:crypto';

import { log as defaultLog } from './logger.js';
import type { TraderCycleResult } from './presets/trader-cycle.js';

const PATH = '/api/nasun-ai/agent/push';
const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 4096;
const HEADER_MAX_BYTES = 256;          // bytes reserved for header/footer of html
const REASON_TRUNC_SUFFIX = '…';

// Keep in sync with chat-server/src/sanitize.ts:sanitizeContent (6-char table).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#96;');
}

function truncateToByteCap(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  // Naive but safe: drop trailing chars until under cap, then append ellipsis.
  let cut = s;
  while (Buffer.byteLength(cut + REASON_TRUNC_SUFFIX, 'utf8') > maxBytes) {
    cut = cut.slice(0, -1);
    if (cut.length === 0) break;
  }
  return cut + REASON_TRUNC_SUFFIX;
}

export interface NotifyEnv {
  HEARTBEAT_PUSH_ENABLED?: string;
  WALLET_ADDRESS?: string;
  CHAT_SERVER_BASE_URL?: string;
  BARAM_CHAT_SERVER_HMAC_SECRET?: string;
  STRATEGY?: string;
  RPC_URL?: string;
}

export interface HeartbeatNotifyDeps {
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
  /** Override explorer base for tx digest link. Defaults to RPC_URL-derived
   *  or hardcoded devnet explorer. */
  explorerBase?: string;
}

function deriveExplorerBase(override?: string): string {
  if (override) return override;
  // Default to devnet explorer; mainnet/testnet override via dep injection.
  return 'https://explorer.nasun.io/devnet/txblock';
}

export function formatHeartbeatHtml(
  result: TraderCycleResult,
  strategy: string,
  explorerBase: string,
): string {
  // Caller guarantees result.outcome === 'succeeded' && action in BUY/SELL
  // before invoking, so result.decision is non-null. Defensive fallback
  // preserved against future refactor.
  const action = result.decision?.action ?? 'HOLD';
  const sizeNUSDC = Math.round(result.decision?.sizeNUSDC ?? 0);
  const rawReason = result.decision?.reason ?? '';
  const digest = result.txDigest;

  const safeStrategy = escapeHtml(strategy || 'default');
  const header = `<b>[Nasun AI · ${safeStrategy}]</b>\n${action} ~${sizeNUSDC} NUSDC`;
  const footer = digest
    ? `\n<a href="${explorerBase}/${encodeURIComponent(digest)}">View tx</a>`
    : '';

  // Budget remaining bytes for the reason line so the total html fits 4096B.
  const fixedBytes = Buffer.byteLength(header + footer, 'utf8') + 32; // 32B slack for tags
  const reasonBudget = Math.max(0, MAX_HTML_BYTES - fixedBytes - HEADER_MAX_BYTES);
  const escapedReason = escapeHtml(truncateToByteCap(rawReason, reasonBudget));
  const reasonLine = escapedReason ? `\n<i>${escapedReason}</i>` : '';

  const html = header + reasonLine + footer;
  // Final hard cap (paranoia; truncate non-tag suffix if somehow over).
  return Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES
    ? html.slice(0, MAX_HTML_BYTES)
    : html;
}

function signPushBody(secretHex: string, body: string): string {
  const secret = Buffer.from(secretHex, 'hex');
  const input = Buffer.concat([Buffer.from('push:', 'utf8'), Buffer.from(body, 'utf8')]);
  return createHmac('sha256', secret).update(input).digest('hex');
}

function shouldNotify(result: TraderCycleResult, env: NotifyEnv): boolean {
  if (env.HEARTBEAT_PUSH_ENABLED !== 'true') return false;
  if (!env.WALLET_ADDRESS) return false;
  if (!env.CHAT_SERVER_BASE_URL) return false;
  if (!env.BARAM_CHAT_SERVER_HMAC_SECRET) return false;
  if (result.outcome !== 'succeeded') return false;
  const action = result.decision?.action;
  if (action !== 'BUY' && action !== 'SELL') return false;
  return true;
}

export async function maybeNotifyHeartbeat(
  result: TraderCycleResult,
  env: NotifyEnv,
  deps: HeartbeatNotifyDeps = {},
): Promise<void> {
  const log = deps.log ?? defaultLog;
  if (!shouldNotify(result, env)) return;

  // Non-null guarded by shouldNotify above.
  const wallet = env.WALLET_ADDRESS!.toLowerCase();
  const base = env.CHAT_SERVER_BASE_URL!.replace(/\/+$/, '');
  const secret = env.BARAM_CHAT_SERVER_HMAC_SECRET!;
  const strategy = env.STRATEGY ?? 'default';
  const explorerBase = deriveExplorerBase(deps.explorerBase);

  let html: string;
  try {
    html = formatHeartbeatHtml(result, strategy, explorerBase);
  } catch (err) {
    log(`[notify] format failed: ${err instanceof Error ? err.message : err}`);
    return;
  }

  const body = JSON.stringify({ wallet, html });
  const hmac = signPushBody(secret, body);

  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${base}${PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-HMAC': hmac },
      body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      log(`[notify] push HTTP ${res.status}: ${txt.slice(0, 200)}`);
      return;
    }
    const json = (await res.json().catch(() => ({}))) as { delivered?: boolean; reason?: string };
    if (json.delivered === false) {
      log(`[notify] push delivered=false reason=${json.reason ?? 'unknown'}`);
    }
  } catch (err) {
    log(`[notify] push fetch failed: ${err instanceof Error ? err.message : err}`);
  }
}

export const __testing__ = {
  escapeHtml,
  truncateToByteCap,
  shouldNotify,
  signPushBody,
  formatHeartbeatHtml,
  MAX_HTML_BYTES,
  PATH,
};
