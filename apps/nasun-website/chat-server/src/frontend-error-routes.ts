/**
 * Frontend error report receiver + Telegram alert.
 *
 * Route: POST /api/frontend-error-report
 *
 * Browsers POST to this when an unrecoverable React error reaches the
 * top-level ErrorBoundary. We forward a short summary to the operator
 * Telegram chat so we hear about it the same hour, not after multiple
 * users open Discord tickets.
 *
 * Why this exists: 2026-05-27 pado universal outage took ~12h to detect
 * because the only user-visible signal was a generic "Transaction failed"
 * toast and no backend log surface. ErrorBoundary catches were happening
 * client-side with no path back to operators. Now they do.
 *
 * Safeguards baked in:
 * - dedup window (5min per fingerprint = `${app}|${message}|${urlPath}`)
 *   so a single user reloading 20 times doesn't spam the alert chat.
 * - global rate cap (max 20 alerts / hour) so a true universal outage
 *   still alerts loudly but never floods.
 * - body size cap (8KB) so anyone POSTing huge payloads can't degrade
 *   the chat-server event loop.
 * - all fields sanitized (no HTML, length-truncated) before reaching
 *   Telegram (which parses HTML mode by default in our operator bot).
 * - reuses AGENT_TELEGRAM_BOT_TOKEN/AGENT_TELEGRAM_ALERT_CHAT_ID — same
 *   operator-only bot used by agent-pm2-monitor. NEVER pipe to a user-
 *   facing bot here.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

const TG_TIMEOUT_MS = 5_000;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const GLOBAL_HOURLY_CAP = 20;
const MAX_BODY_BYTES = 8 * 1024;

interface DedupEntry {
  expiresAt: number;
}

const dedup = new Map<string, DedupEntry>();
let hourlyBucketStart = Date.now();
let hourlyCount = 0;

function sanitize(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .slice(0, max)
    .trim();
}

function checkRateLimits(fingerprint: string): { allowed: boolean; reason?: string } {
  const now = Date.now();

  // Reset hourly bucket
  if (now - hourlyBucketStart > 60 * 60 * 1000) {
    hourlyBucketStart = now;
    hourlyCount = 0;
  }
  if (hourlyCount >= GLOBAL_HOURLY_CAP) {
    return { allowed: false, reason: 'hourly_cap' };
  }

  // Dedup: drop seen-recently fingerprints
  const existing = dedup.get(fingerprint);
  if (existing && existing.expiresAt > now) {
    return { allowed: false, reason: 'dedup' };
  }
  // GC expired entries opportunistically
  if (dedup.size > 200) {
    for (const [k, v] of dedup.entries()) {
      if (v.expiresAt <= now) dedup.delete(k);
    }
  }

  dedup.set(fingerprint, { expiresAt: now + DEDUP_WINDOW_MS });
  hourlyCount += 1;
  return { allowed: true };
}

async function sendOperatorAlert(text: string): Promise<void> {
  const token = process.env.AGENT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.AGENT_TELEGRAM_ALERT_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[frontend-error] AGENT_TELEGRAM_BOT_TOKEN/CHAT_ID unset; alert suppressed');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TG_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[frontend-error] tg HTTP ${res.status} dropped`);
    }
  } catch (err) {
    console.warn(`[frontend-error] tg send failed: ${(err as Error).message}`);
  }
}

interface ErrorReport {
  app?: string;
  message?: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  buildHash?: string;
  walletAddress?: string;
}

function urlPath(s: string): string {
  try {
    return new URL(s).pathname;
  } catch {
    return s.slice(0, 80);
  }
}

function formatAlert(r: ErrorReport): string {
  const app = sanitize(r.app, 32) || 'unknown';
  const msg = sanitize(r.message, 200) || '(no message)';
  const url = sanitize(r.url, 200) || '';
  const ua = sanitize(r.userAgent, 100) || '';
  const build = sanitize(r.buildHash, 32) || '';
  const wallet = sanitize(r.walletAddress, 70);
  const compStack = sanitize(r.componentStack, 400);

  const lines = [
    `<b>⚠️ Frontend error: ${app}</b>`,
    `<code>${msg}</code>`,
    '',
    `URL: ${url}`,
  ];
  if (build) lines.push(`Build: ${build}`);
  if (wallet) lines.push(`Wallet: <code>${wallet.slice(0, 12)}…${wallet.slice(-6)}</code>`);
  if (compStack) lines.push('', `<i>Component stack (truncated)</i>`, `<pre>${compStack}</pre>`);
  if (ua) lines.push('', `UA: ${ua}`);
  return lines.join('\n');
}

export async function handleFrontendErrorReport(
  req: IncomingMessage,
  res: ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders);
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  let raw = '';
  let bytes = 0;
  let overflow = false;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      overflow = true;
      break;
    }
    raw += chunk.toString('utf8');
  }
  if (overflow) {
    res.writeHead(413, corsHeaders);
    res.end(JSON.stringify({ error: 'payload_too_large' }));
    return;
  }

  let body: ErrorReport;
  try {
    body = JSON.parse(raw) as ErrorReport;
  } catch {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'invalid_json' }));
    return;
  }

  const fingerprint = [
    sanitize(body.app, 32) || 'unknown',
    (sanitize(body.message, 200) || '').slice(0, 120),
    urlPath(sanitize(body.url, 200) || ''),
  ].join('|');

  const rate = checkRateLimits(fingerprint);
  if (!rate.allowed) {
    // Acknowledge so the browser doesn't retry. We deliberately do not
    // tell the caller "dedup" / "cap" — the client doesn't need to know.
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ ok: true, suppressed: rate.reason }));
    return;
  }

  await sendOperatorAlert(formatAlert(body));
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ ok: true }));
}

// Test-only helpers
export function _resetForTests(): void {
  dedup.clear();
  hourlyBucketStart = Date.now();
  hourlyCount = 0;
}
