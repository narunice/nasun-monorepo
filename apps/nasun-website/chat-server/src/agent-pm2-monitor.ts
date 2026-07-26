// 2026-05-26 — PM2 ↔ agent_keys drift monitor.
//
// Sole purpose: ALERT, not fix. The drift poll already fixes (stops orphans,
// spawns missing). This module catches the residual class where reconcile
// itself is broken (new code regression, RPC permanently degraded, pm2
// daemon dead, etc.) by alerting operators when the two sides diverge for
// longer than one expected reconcile window.
//
// Why a separate module and not another phaseExpire-style cron:
// - Different cadence: SQL <-> PM2 audit is fine at 5min; the drift poll
//   runs every 60s for fix latency.
// - Different failure mode: monitor must NEVER take pm2 actions. A bug here
//   could mass-kill legit agents. Read-only by construction.
// - Telegram alert uses AGENT_TELEGRAM_BOT_TOKEN/AGENT_TELEGRAM_ALERT_CHAT_ID
//   (operator bot), not BARAM_TG_BOT_TOKEN (user-facing bot). Separate
//   bots ensure an operator-only alert never leaks into a user chat.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDb } from './store.js';
import { readAgentStateSnapshot, type AgentState } from './agent-orchestrator.js';

const exec = promisify(execFile);

const PM2_BIN = process.env.PM2_BIN ?? '/usr/bin/pm2';
const PM2_HOME = process.env.PM2_HOME ?? '/home/ec2-user/.pm2';
const AGENT_PM2_PREFIX = 'nasun-ai-agent-';
const MONITOR_INTERVAL_MS = 5 * 60 * 1000;
const TG_TIMEOUT_MS = 5_000;

// One alert per state transition, not per tick. Otherwise a single
// stuck orphan would Telegram-spam the operator every 5 minutes for hours.
// Key: sorted("orphan:name,missing:name") so any change in the set
// produces a new key. Empty diff resets to '' so the next non-empty diff
// re-alerts even if it matches a previously-seen state.
let lastAlertKey: string | null = null;

// A "missing" candidate only alerts after it has been observed as
// desired-running for ALERT_MIN_STREAK consecutive ticks. filterDesiredRunning
// defensively KEEPS a candidate whenever readAgentStateSnapshot throws (a
// one-off SQLite BUSY under WAL, a transient RPC blip), so a dead agent whose
// on-chain profile is gone would otherwise flap alert<->clear tick after tick
// (observed with nasun-ai-agent-e4abc071: a dogfood row, on-chain notExists,
// flapping 30+ times). Debouncing on persistence kills the flap without
// swallowing real drift: a genuinely down agent is missing EVERY tick, so its
// streak climbs and it still fires after ALERT_MIN_STREAK ticks.
const ALERT_MIN_STREAK = 2;
const missingStreak = new Map<string, number>();

interface DriftRow {
  pm2_name: string;
  agent_address: string;
}

interface Pm2ProcessLite {
  name: string;
}

interface DriftReport {
  /** pm2 has it, SQL says it should be paused or deleted. */
  orphans: string[];
  /** SQL says it should be running, pm2 doesn't have it. */
  missing: string[];
}

export function computeDriftReport(
  sqlActive: ReadonlySet<string>,
  pm2Names: ReadonlySet<string>,
): DriftReport {
  const orphans: string[] = [];
  const missing: string[] = [];
  for (const name of pm2Names) {
    if (name.startsWith(AGENT_PM2_PREFIX) && !sqlActive.has(name)) {
      orphans.push(name);
    }
  }
  for (const name of sqlActive) {
    if (!pm2Names.has(name)) {
      missing.push(name);
    }
  }
  orphans.sort();
  missing.sort();
  return { orphans, missing };
}

function pm2Env(): NodeJS.ProcessEnv {
  return {
    HOME: process.env.HOME ?? '/home/ec2-user',
    PM2_HOME,
    PATH: process.env.PATH ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  };
}

async function readPm2Names(): Promise<Set<string>> {
  const { stdout } = await exec(PM2_BIN, ['jlist'], { env: pm2Env(), timeout: 5_000 });
  const parsed = JSON.parse(stdout) as Pm2ProcessLite[];
  if (!Array.isArray(parsed)) return new Set();
  return new Set(parsed.map((p) => p.name));
}

function readSqlActiveAgents(): { names: Set<string>; addrByName: Map<string, string> } {
  const rows = getDb().prepare(
    // paused_at IS NULL covers both real-alpha agents (slot_exempt=0) and
    // dogfood (slot_exempt=1) — alpha-cron only stamps paused_at on the
    // former, so the latter naturally pass through. This is NECESSARY but
    // not sufficient for "should be running": see filterDesiredRunning.
    `SELECT pm2_name, agent_address FROM agent_keys
      WHERE deleted_at IS NULL AND paused_at IS NULL`,
  ).all() as DriftRow[];
  const names = new Set<string>();
  const addrByName = new Map<string, string>();
  for (const r of rows) {
    names.add(r.pm2_name);
    addrByName.set(r.pm2_name, r.agent_address);
  }
  return { names, addrByName };
}

// A missing candidate (SQL-active row with no pm2 process) is true drift only
// if the orchestrator actually WANTS it running. deriveAgentState returns
// 'activated' only when on-chain is_active=true AND config enabled=true AND the
// vault is present. The other states are intentionally stopped and must not
// alert:
//   - 'killed'  : wallet deactivated the agent on-chain (is_active=false)
//   - 'paused'  : config disabled, or vault removed
//   - 'unknown' : on-chain profile missing/notExists, or RPC read failed
// Motivating false positive: a dogfood agent (slot_exempt=1) is never stamped
// paused_at, so a deactivated/pruned dogfood profile would otherwise alert
// forever (e.g. nasun-ai-agent-e4abc071, 2026-06). Unresolvable rows (no
// agent_address, or snapshot throws) are KEPT — a broken lookup is itself
// worth investigating, and a full RPC outage already trips the AER heartbeat
// watchdog separately.
export async function filterDesiredRunning(
  candidates: readonly string[],
  addrByName: ReadonlyMap<string, string>,
  getState: (addr: string) => Promise<{ state: AgentState }>,
): Promise<string[]> {
  const real: string[] = [];
  for (const name of candidates) {
    const addr = addrByName.get(name);
    if (!addr) {
      real.push(name);
      continue;
    }
    try {
      const { state } = await getState(addr);
      if (state === 'activated') real.push(name);
    } catch {
      real.push(name);
    }
  }
  return real;
}

// Advance the per-name streak against the current desired-running missing set
// and return only names that have persisted for >= minStreak ticks. Names
// absent from `missing` are dropped from `streak` so a cleared-then-reappearing
// agent restarts its count from zero (a transient blip never accumulates).
export function confirmPersistentMissing(
  missing: readonly string[],
  streak: Map<string, number>,
  minStreak: number,
): string[] {
  const current = new Set(missing);
  for (const name of [...streak.keys()]) {
    if (!current.has(name)) streak.delete(name);
  }
  const confirmed: string[] = [];
  for (const name of missing) {
    const next = (streak.get(name) ?? 0) + 1;
    streak.set(name, next);
    if (next >= minStreak) confirmed.push(name);
  }
  confirmed.sort();
  return confirmed;
}

async function sendOperatorAlert(text: string): Promise<void> {
  const token = process.env.AGENT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.AGENT_TELEGRAM_ALERT_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[pm2-monitor] AGENT_TELEGRAM_BOT_TOKEN/CHAT_ID unset; alert suppressed');
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
      console.warn(`[pm2-monitor] tg HTTP ${res.status} dropped`);
    }
  } catch (err) {
    console.warn(`[pm2-monitor] tg send failed: ${(err as Error).message}`);
  }
}

function formatAlert(report: DriftReport): string {
  const lines: string[] = [`<b>⚠️ Nasun AI PM2 drift detected</b>`];
  if (report.orphans.length > 0) {
    lines.push('');
    lines.push(`<b>Orphan PM2 (pm2 alive, SQL paused/deleted):</b>`);
    for (const name of report.orphans) lines.push(`  • <code>${name}</code>`);
  }
  if (report.missing.length > 0) {
    lines.push('');
    lines.push(`<b>Missing PM2 (SQL active, pm2 gone):</b>`);
    for (const name of report.missing) lines.push(`  • <code>${name}</code>`);
  }
  lines.push('');
  lines.push(`Investigate: drift poll may be stuck, RPC degraded, or pm2 daemon broken.`);
  return lines.join('\n');
}

async function tick(): Promise<void> {
  try {
    const { names: sqlActive, addrByName } = readSqlActiveAgents();
    const pm2Names = await readPm2Names();
    const report = computeDriftReport(sqlActive, pm2Names);
    // Drop missing candidates the orchestrator intentionally keeps stopped
    // (deactivated / disabled / on-chain profile gone) so they don't alert
    // forever. Orphans are left as-is: a pm2 process the DB says should be
    // gone is real drift regardless of on-chain state.
    report.missing = await filterDesiredRunning(
      report.missing,
      addrByName,
      readAgentStateSnapshot,
    );
    // Debounce: only alert on missing agents that stayed desired-running across
    // consecutive ticks, so a single transient snapshot error can't flap.
    report.missing = confirmPersistentMissing(report.missing, missingStreak, ALERT_MIN_STREAK);
    const key = report.orphans.length === 0 && report.missing.length === 0
      ? ''
      : `orphan:${report.orphans.join(',')}|missing:${report.missing.join(',')}`;
    if (key === lastAlertKey) return;
    lastAlertKey = key;
    if (key === '') {
      console.log('[pm2-monitor] drift cleared');
      return;
    }
    console.warn(`[pm2-monitor] drift: orphans=${report.orphans.length} missing=${report.missing.length}`);
    await sendOperatorAlert(formatAlert(report));
  } catch (err) {
    console.warn(`[pm2-monitor] tick failed: ${(err as Error).message}`);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startPm2Monitor(): void {
  if (timer) return;
  // Skip the first tick in fresh boots: the drift poll's first sweep needs
  // ~60s to converge after a chat-server restart, and we don't want a
  // spurious alert in that window.
  timer = setInterval(() => { void tick(); }, MONITOR_INTERVAL_MS);
  timer.unref();
}

export function stopPm2Monitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  lastAlertKey = null;
  missingStreak.clear();
}
