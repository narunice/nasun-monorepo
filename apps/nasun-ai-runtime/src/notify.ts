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
  /** User-facing label sourced from chat-server trader config (Phase 7,
   *  2026-05-23). Empty or absent means the runtime falls back to a
   *  strategy-only header — that's the old behavior that caused
   *  Santa-vs-Jane misattribution on 2026-05-23. */
  AGENT_NAME?: string;
}

export interface HeartbeatNotifyDeps {
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
  /** Override explorer base for tx digest link. Defaults to RPC_URL-derived
   *  or hardcoded devnet explorer. */
  explorerBase?: string;
}

export interface TradeFills {
  /** Net base coin entering escrow (positive on BUY, negative on SELL). NBTC, 8 decimals. */
  baseDelta: number;
  /** Net quote coin entering escrow (positive on SELL, negative on BUY). NUSDC, 6 decimals. */
  quoteDelta: number;
}

const BASE_DECIMALS = 8;   // NBTC
const QUOTE_DECIMALS = 6;  // NUSDC

// Parse Escrow{Withdrawn,Deposited} events from a settled tx and return
// net base/quote movement (escrow's frame, not wallet's). Best-effort: any
// RPC or parse failure returns null and the caller falls back to the plain
// header-only message.
export async function fetchTradeFills(
  rpcUrl: string,
  digest: string,
  fetchImpl: typeof fetch,
): Promise<TradeFills | null> {
  try {
    const res = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getTransactionBlock',
        params: [digest, { showEvents: true }],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { events?: Array<{ type: string; parsedJson?: { asset?: { name?: string }; amount?: string } }> };
    };
    const events = json.result?.events ?? [];
    let baseRaw = 0n;
    let quoteRaw = 0n;
    for (const ev of events) {
      const m = /::escrow::Escrow(Withdrawn|Deposited)$/.exec(ev.type);
      if (!m) continue;
      const dir = m[1] === 'Deposited' ? 1n : -1n;
      const name = ev.parsedJson?.asset?.name ?? '';
      const amt = BigInt(ev.parsedJson?.amount ?? '0');
      if (name.endsWith('::nbtc::NBTC')) baseRaw += dir * amt;
      else if (name.endsWith('::nusdc::NUSDC')) quoteRaw += dir * amt;
    }
    if (baseRaw === 0n && quoteRaw === 0n) return null;
    return {
      baseDelta: Number(baseRaw) / 10 ** BASE_DECIMALS,
      quoteDelta: Number(quoteRaw) / 10 ** QUOTE_DECIMALS,
    };
  } catch {
    return null;
  }
}

function deriveExplorerBase(override?: string): string {
  if (override) return override;
  // Default to devnet explorer; mainnet/testnet override via dep injection.
  return 'https://explorer.nasun.io/devnet/tx';
}

function formatFillsLine(action: string, fills: TradeFills): string {
  // Escrow's frame: BUY = +base, -quote ; SELL = -base, +quote.
  // Format with enough precision to show small amounts (NBTC 8 decimals).
  const base = Math.abs(fills.baseDelta);
  const quote = Math.abs(fills.quoteDelta);
  const baseStr = base < 0.01 ? base.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') : base.toFixed(6);
  const quoteStr = quote.toFixed(4);
  if (action === 'BUY') {
    return `Filled: +${baseStr} NBTC ← ${quoteStr} NUSDC (in escrow)`;
  }
  if (action === 'SELL') {
    return `Filled: ${baseStr} NBTC → +${quoteStr} NUSDC (in escrow)`;
  }
  return '';
}

export interface FormatHeartbeatOpts {
  fills?: TradeFills | null;
  agentName?: string;
}

/**
 * Trailing optionals are bundled into an options object so a future
 * fifth signal cannot be misaligned with `agentName` at a call site
 * (which was the original Phase 7 review concern).
 */
export function formatHeartbeatHtml(
  result: TraderCycleResult,
  strategy: string,
  explorerBase: string,
  opts: FormatHeartbeatOpts = {},
): string {
  const fills = opts.fills;
  const agentName = opts.agentName;
  // Caller guarantees result.outcome === 'succeeded' && action in BUY/SELL
  // before invoking, so result.decision is non-null. Defensive fallback
  // preserved against future refactor.
  const action = result.decision?.action ?? 'HOLD';
  const sizeNUSDC = Math.round(result.decision?.sizeNUSDC ?? 0);
  const rawReason = result.decision?.reason ?? '';
  const digest = result.txDigest;

  const safeStrategy = escapeHtml(strategy || 'default');
  // Phase 7: include the user-facing agent name in the header so
  // multiple agents belonging to the same wallet are distinguishable
  // at a glance in the shared Telegram chat. Empty / missing name
  // falls back to the original strategy-only header.
  const trimmedName = (agentName ?? '').trim();
  const safeName = trimmedName ? escapeHtml(trimmedName) : '';
  const headerLabel = safeName ? `${safeName} · ${safeStrategy}` : safeStrategy;
  const header = `<b>[Nasun AI · ${headerLabel}]</b>\n${action} ~${sizeNUSDC} NUSDC`;
  const fillsLine = fills ? `\n${escapeHtml(formatFillsLine(action, fills))}` : '';
  const footer = digest
    ? `\n<a href="${explorerBase}/${encodeURIComponent(digest)}">View tx</a>`
    : '';

  // Budget remaining bytes for the reason line so the total html fits 4096B.
  const fixedBytes = Buffer.byteLength(header + fillsLine + footer, 'utf8') + 32; // 32B slack for tags
  const reasonBudget = Math.max(0, MAX_HTML_BYTES - fixedBytes - HEADER_MAX_BYTES);
  const escapedReason = escapeHtml(truncateToByteCap(rawReason, reasonBudget));
  const reasonLine = escapedReason ? `\n<i>${escapedReason}</i>` : '';

  const html = header + reasonLine + fillsLine + footer;
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
  const agentName = env.AGENT_NAME;
  const explorerBase = deriveExplorerBase(deps.explorerBase);

  const fetchImpl = deps.fetchImpl ?? fetch;

  // Best-effort fill enrichment: parse Escrow events from the settled tx so
  // the user sees the actual swap outcome (escrow NBTC inflow + NUSDC spent),
  // not just the intent. Wallet-visible +1 NUSDC is the AER executor payout,
  // not the trade result — without this line the message is misleading.
  let fills: TradeFills | null = null;
  if (result.txDigest && env.RPC_URL) {
    fills = await fetchTradeFills(env.RPC_URL, result.txDigest, fetchImpl);
  }

  let html: string;
  try {
    html = formatHeartbeatHtml(result, strategy, explorerBase, { fills, agentName });
  } catch (err) {
    log(`[notify] format failed: ${err instanceof Error ? err.message : err}`);
    return;
  }

  const body = JSON.stringify({ wallet, html });
  const hmac = signPushBody(secret, body);

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
