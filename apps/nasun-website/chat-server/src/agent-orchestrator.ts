// PR2.A — chat-server PM2 orchestrator.
//
// Spawns one PM2 process per activated agent. The chat-server EC2 hosts
// 14 unrelated PM2 processes (pado-bots, gostop-bots, lp-bot-*,
// nasun-chat-server itself, etc.). Every pm2 invocation in this module
// asserts the target name starts with 'nasun-ai-agent-' so a logic bug
// here cannot delete an unrelated bot.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { getDb } from './store.js';

const exec = promisify(execFile);

const PM2_BIN = process.env.PM2_BIN ?? '/usr/bin/pm2';
const PM2_HOME = process.env.PM2_HOME ?? '/home/ec2-user/.pm2';
const RUNTIME_CWD = process.env.NASUN_AI_RUNTIME_CWD ?? '/home/ec2-user/nasun-ai-runtime';
const ECOSYSTEM_TEMPLATE = `${RUNTIME_CWD}/ecosystem.agent-template.cjs`;

const PORT_BASE = 4401;          // 4400 reserved for legacy nasun-ai-runtime
const PORT_MAX = 4500;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const AGENT_PM2_PREFIX = 'nasun-ai-agent-';
const LEGACY_RUNTIME_NAME = 'nasun-ai-runtime';

export function pm2NameForAgent(agentAddress: string): string {
  // Deterministic so restart of chat-server can recompute the name from
  // SQLite alone. sha256(agent).slice(0,8) collides at ~2^32 — fine for N≤99.
  return AGENT_PM2_PREFIX + createHash('sha256')
    .update(agentAddress.toLowerCase())
    .digest('hex')
    .slice(0, 8);
}

function assertSafeName(pm2Name: string): void {
  if (!pm2Name.startsWith(AGENT_PM2_PREFIX)) {
    throw new Error(`refuse_unsafe_pm2_name: ${pm2Name}`);
  }
}

const pm2Env = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  PM2_HOME,
  PATH: process.env.PATH ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  ...extra,
});

interface Pm2ProcessLite {
  name: string;
  pm2_env?: { status?: string };
}

async function pm2List(): Promise<Pm2ProcessLite[]> {
  const { stdout } = await exec(PM2_BIN, ['jlist'], { env: pm2Env(), timeout: 5_000 });
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface SpawnOptions {
  agentAddress: string;
  pm2Name: string;
  paramName: string;
  wakePort: number;
}

export async function spawnAgentPm2(opts: SpawnOptions): Promise<void> {
  assertSafeName(opts.pm2Name);
  await exec(PM2_BIN, [
    'start', ECOSYSTEM_TEMPLATE,
    '--name', opts.pm2Name,
    '--update-env',
  ], {
    cwd: RUNTIME_CWD,
    env: pm2Env({
      PM2_AGENT_NAME: opts.pm2Name,
      AGENT_SECRET_PARAM: opts.paramName,
      AGENT_ADDRESS: opts.agentAddress,
      WAKE_PORT: String(opts.wakePort),
      // AGENT_PRIVATE_KEY intentionally absent — keypair lives only inside
      // the spawned process closure, fetched from SSM on startup.
    }),
    timeout: 15_000,
  });
  // Sanity check: did pm2 actually adopt the process?
  const list = await pm2List();
  if (!list.some(p => p.name === opts.pm2Name)) {
    throw new Error(`spawn_sanity_failed: ${opts.pm2Name} not in pm2 list`);
  }
}

export async function stopAgentPm2(pm2Name: string): Promise<void> {
  assertSafeName(pm2Name);
  await exec(PM2_BIN, ['delete', pm2Name], { env: pm2Env(), timeout: 10_000 });
}

export async function getRunningAgents(): Promise<string[]> {
  const list = await pm2List();
  return list
    .map(p => p.name)
    .filter(n => n.startsWith(AGENT_PM2_PREFIX));
}

/**
 * Returns true when the legacy single-tenant 'nasun-ai-runtime' PM2
 * process is online AND configured for the given agent address.
 *
 * We can't tell from `pm2 jlist` what AGENT_PRIVATE_KEY decoded to, so we
 * fall back to: legacy is running AND a baram_agent_endpoints row exists
 * for this agent on port 4400. The runtime currently registers itself
 * with port 4400, so this is a reliable proxy.
 */
export async function hasLegacyNasunAiRuntime(agentAddress: string): Promise<boolean> {
  let legacyOnline = false;
  try {
    const list = await pm2List();
    legacyOnline = list.some(p =>
      p.name === LEGACY_RUNTIME_NAME && p.pm2_env?.status === 'online'
    );
  } catch {
    legacyOnline = false;  // pm2 unavailable → don't block uploads
  }
  if (!legacyOnline) return false;
  const row = getDb().prepare(
    `SELECT 1 FROM baram_agent_endpoints WHERE agent = ? AND http_url LIKE '%:4400'`
  ).get(agentAddress.toLowerCase());
  return Boolean(row);
}

/**
 * Allocate the lowest free wake_port. Soft-deleted rows within the 7-day
 * grace window still count as occupying their port — restoring an agent
 * may reassign it (and the UI surfaces that change to the user).
 */
export function allocatePort(): number {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const rows = getDb().prepare(
    `SELECT wake_port FROM agent_keys WHERE deleted_at IS NULL OR deleted_at > ?`
  ).all(cutoff) as { wake_port: number }[];
  const taken = new Set<number>(rows.map(r => r.wake_port));
  for (let p = PORT_BASE; p < PORT_MAX; p++) if (!taken.has(p)) return p;
  throw new Error('no_free_port');
}
