/**
 * AER heartbeat watchdog.
 *
 * Every preset that lands an AER calls recordAerLanded(). A background
 * timer checks the last-landed timestamp; if more than STALE_MS has
 * elapsed (after an initial startup grace) it fires a Telegram alert to
 * TELEGRAM_ALERT_CHAT_ID. Repeated alerts are gated by COOLDOWN_MS so a
 * stuck agent does not flood the channel.
 *
 * Operator-facing and shared across agents. User-facing trade
 * notifications are not emitted by the runtime; the wake-forwarding bot
 * (chat-server BARAM_TG_*) is the sole user channel.
 *
 * Failure mode: if TELEGRAM_ALERT_CHAT_ID is unset, the watchdog still
 * runs and logs stalls locally, but no Telegram message is sent. This
 * matches the alpha posture where ops alerts are opt-in per environment.
 */

import { sendTelegramMessage } from './telegram.js';

const DEFAULT_COOLDOWN_MIN = 30;
const MIN_STALE_MS = 5 * 60 * 1000;
const MIN_STARTUP_GRACE_MS = 10 * 60 * 1000;

let lastLandedAt = Date.now();
let lastAlertAt = 0;
let startedAt = Date.now();
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

export function recordAerLanded(): void {
  lastLandedAt = Date.now();
}

export interface HeartbeatWatchdogOptions {
  agentAddress: string;
  log: (msg: string) => void;
  /**
   * Configured cycle cadence in minutes. The default stale threshold is
   * derived from this so a 30-minute trader does not get false alarms
   * every 5 minutes between cycles. An explicit `AER_HEARTBEAT_STALE_MIN`
   * env var overrides this derivation.
   */
  intervalMinutes: number;
  staleMs?: number;
  cooldownMs?: number;
  checkIntervalMs?: number;
}

/**
 * Start the AER heartbeat watchdog. Idempotent: calling twice replaces
 * the existing timer.
 */
export function startAerHeartbeatWatchdog(opts: HeartbeatWatchdogOptions): void {
  const intervalMs = Math.max(opts.intervalMinutes, 1) * 60_000;
  // Default: two missed cycles (plus a 5-minute floor so a hypothetical
  // sub-minute cadence still has slack for RPC latency). Explicit env
  // override wins when an operator wants tighter or looser bounds.
  const envStaleMs = parseMinutesEnv('AER_HEARTBEAT_STALE_MIN', null);
  const staleMs = opts.staleMs ?? envStaleMs ?? Math.max(intervalMs * 2, MIN_STALE_MS);
  const cooldownMs = opts.cooldownMs ?? parseMinutesEnv('AER_HEARTBEAT_COOLDOWN_MIN', DEFAULT_COOLDOWN_MIN)!;
  const checkIntervalMs = opts.checkIntervalMs ?? 60_000;
  const startupGraceMs = Math.max(staleMs * 2, intervalMs * 2, MIN_STARTUP_GRACE_MS);

  const botToken = process.env.TELEGRAM_ALERT_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID ?? '';

  if (watchdogTimer) clearInterval(watchdogTimer);

  startedAt = Date.now();
  lastLandedAt = Date.now();
  lastAlertAt = 0;

  opts.log(
    `[heartbeat-watchdog] stale=${Math.round(staleMs / 60_000)}min cooldown=${Math.round(cooldownMs / 60_000)}min ` +
      `alert=${chatId ? 'telegram' : 'log-only'}`,
  );

  watchdogTimer = setInterval(() => {
    void tick({
      now: Date.now(),
      staleMs,
      cooldownMs,
      startupGraceMs,
      agentAddress: opts.agentAddress,
      log: opts.log,
      botToken,
      chatId,
    });
  }, checkIntervalMs);
  watchdogTimer.unref();
}

interface TickContext {
  now: number;
  staleMs: number;
  cooldownMs: number;
  startupGraceMs: number;
  agentAddress: string;
  log: (msg: string) => void;
  botToken: string;
  chatId: string;
}

async function tick(ctx: TickContext): Promise<void> {
  const sinceStart = ctx.now - startedAt;
  if (sinceStart < ctx.startupGraceMs) return;

  const sinceLast = ctx.now - lastLandedAt;
  if (sinceLast < ctx.staleMs) return;

  const sinceAlert = ctx.now - lastAlertAt;
  if (lastAlertAt !== 0 && sinceAlert < ctx.cooldownMs) return;

  const sinceLastMin = Math.round(sinceLast / 60_000);
  ctx.log(`[heartbeat-watchdog] STALE: no AER landed in ${sinceLastMin} minutes`);

  if (!ctx.botToken || !ctx.chatId) {
    lastAlertAt = ctx.now;
    return;
  }

  const shortAddr = `${ctx.agentAddress.slice(0, 6)}...${ctx.agentAddress.slice(-4)}`;
  const ts = new Date(ctx.now).toLocaleString('en-US');
  const text = [
    `<b>[Nasun AI] AER heartbeat stalled</b>`,
    `Agent: <code>${shortAddr}</code>`,
    `No AER landed in ${sinceLastMin} minutes`,
    `Time: ${ts}`,
  ].join('\n');

  // Update lastAlertAt regardless of send result. If the send failed
  // (Telegram unreachable, bot blocked, chat archived), the cooldown
  // still applies so the next 60s tick does not re-attempt and hammer
  // the Telegram API. The stall is already logged above; an extended
  // outage will simply skip alerts until the cooldown elapses.
  const ok = await sendTelegramMessage(ctx.botToken, ctx.chatId, text);
  if (!ok) {
    ctx.log('[heartbeat-watchdog] Telegram alert send failed; suppressing retries until cooldown elapses');
  }
  lastAlertAt = ctx.now;
}

function parseMinutesEnv(name: string, defaultMin: number | null): number | null {
  const raw = process.env[name];
  if (!raw) return defaultMin === null ? null : defaultMin * 60_000;
  const n = Number(raw);
  // Reject sub-minute and non-finite values; `Number("1e-3")` is 0.001
  // which would otherwise produce a 60ms watchdog interval and spam the
  // alert path. One minute is the floor for any operator-tunable value.
  if (!Number.isFinite(n) || n < 1) {
    return defaultMin === null ? null : defaultMin * 60_000;
  }
  return n * 60_000;
}

/** Test/diagnostic accessor. */
export function _heartbeatState() {
  return { lastLandedAt, lastAlertAt, startedAt };
}
