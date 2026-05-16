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
import { fetchCapabilityEscrowId } from './sui-capability-utils.js';

const exec = promisify(execFile);

const PM2_BIN = process.env.PM2_BIN ?? '/usr/bin/pm2';
const PM2_HOME = process.env.PM2_HOME ?? '/home/ec2-user/.pm2';
const RUNTIME_CWD = process.env.NASUN_AI_RUNTIME_CWD ?? '/home/ec2-user/nasun-ai-runtime';
// Filename must end in `.config.cjs` so pm2 auto-detects it as an ecosystem
// config. With any other suffix pm2 falls back to script mode, runs the file
// as a regular Node script (apps[] just becomes module.exports), and never
// executes src/index.ts — so the wake server never binds and the agent never
// registers in baram_agent_endpoints.
const ECOSYSTEM_TEMPLATE = `${RUNTIME_CWD}/agent-template.config.cjs`;

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

/**
 * PR2.A.1 — shape of the trader config JSON mirrored from the browser
 * (TraderConfigForm save → POST /api/nasun-ai/config). Source of truth:
 * apps/nasun-website/frontend/src/sections/uju/ai/types/trader.ts.
 * Only the fields the runtime cares about are typed here.
 */
interface TraderConfigJson {
  budgetId?: string;
  perTradeMaxQuoteRaw?: string;
  dailyMaxQuoteRaw?: string;
  intervalMinutes?: number;
  maxSlippageBps?: number;
  strategyPresetId?: string;
  pair?: string;
}

/**
 * Trader env vars that are identical across every spawned agent. Sourced
 * from chat-server's process.env. AGENT_GLOBAL_ prefix is used for vars
 * introduced for this orchestrator path so an operator looking at the
 * chat-server .env can tell at a glance which vars feed the spawned
 * agents vs. chat-server itself. Already-shared secrets (HMAC, JWT,
 * RPC_URL) are inherited under their canonical names with no prefix.
 */
function globalTraderEnv(): NodeJS.ProcessEnv {
  const pick = (name: string, opts: { required: boolean } = { required: true }): string => {
    const val = process.env[`AGENT_GLOBAL_${name}`] ?? process.env[name] ?? '';
    if (opts.required && !val) {
      throw new Error(`missing_global_trader_env:AGENT_GLOBAL_${name}`);
    }
    return val;
  };
  const out: NodeJS.ProcessEnv = {
    BARAM_PACKAGE_ID:     pick('BARAM_PACKAGE_ID'),
    BARAM_REGISTRY_ID:    pick('BARAM_REGISTRY_ID'),
    BARAM_AER_PACKAGE_ID: pick('BARAM_AER_PACKAGE_ID'),
    BARAM_API_KEY:        pick('BARAM_API_KEY'),
    EXECUTOR_ADDRESS:     pick('EXECUTOR_ADDRESS'),
    HOST_URL:             pick('HOST_URL'),
    COIN_NBTC_TYPE:       pick('COIN_NBTC_TYPE'),
    COIN_NUSDC_TYPE:      pick('COIN_NUSDC_TYPE'),
    CHAT_SERVER_BASE_URL: process.env.AGENT_GLOBAL_CHAT_SERVER_BASE_URL
                          ?? 'http://127.0.0.1:3101',
    RPC_URL:              process.env.RPC_URL ?? 'https://rpc.devnet.nasun.io',
    BARAM_CHAT_SERVER_HMAC_SECRET: pick('BARAM_CHAT_SERVER_HMAC_SECRET'),
    BARAM_SESSION_JWT_SECRET:      pick('BARAM_SESSION_JWT_SECRET'),
  };
  // Optional trader-cycle Telegram notifications — distinct from
  // BARAM_TG_* (chat-server's wake-forwarding bot). Only set when
  // operator opts in via AGENT_TELEGRAM_*.
  if (process.env.AGENT_TELEGRAM_BOT_TOKEN) {
    out.TELEGRAM_BOT_TOKEN = process.env.AGENT_TELEGRAM_BOT_TOKEN;
  }
  if (process.env.AGENT_TELEGRAM_CHAT_ID) {
    out.TELEGRAM_CHAT_ID = process.env.AGENT_TELEGRAM_CHAT_ID;
  }
  return out;
}

/**
 * PR2.A.1 — assemble the per-agent env block from SQLite + on-chain
 * fetch. Throws with a structured error code if any required piece is
 * missing so the vault-routes caller can surface it to the UI.
 */
async function perAgentTraderEnv(agentAddress: string): Promise<NodeJS.ProcessEnv> {
  const lower = agentAddress.toLowerCase();
  const keyRow = getDb().prepare(
    `SELECT capability_id, wallet_address
     FROM agent_keys
     WHERE agent_address = ? AND deleted_at IS NULL`,
  ).get(lower) as { capability_id: string | null; wallet_address: string } | undefined;
  if (!keyRow) throw new Error(`agent_key_row_missing:${lower}`);
  if (!keyRow.capability_id) {
    throw new Error(`capability_id_missing_for_${lower}:re-upload required`);
  }

  const cfgRow = getDb().prepare(
    `SELECT config_json FROM nasun_ai_trader_configs WHERE agent_address = ?`,
  ).get(lower) as { config_json: string } | undefined;
  if (!cfgRow) {
    throw new Error(
      `trader_config_missing_for_${lower}:save trader config from Dashboard first`,
    );
  }
  let cfg: TraderConfigJson;
  try {
    cfg = JSON.parse(cfgRow.config_json) as TraderConfigJson;
  } catch {
    throw new Error(`trader_config_parse_failed:${lower}`);
  }

  if (!cfg.budgetId)              throw new Error(`trader_config_missing_field:budgetId`);
  if (!cfg.perTradeMaxQuoteRaw)   throw new Error(`trader_config_missing_field:perTradeMaxQuoteRaw`);
  if (!cfg.dailyMaxQuoteRaw)      throw new Error(`trader_config_missing_field:dailyMaxQuoteRaw`);

  const escrowId = await fetchCapabilityEscrowId(keyRow.capability_id);

  // Runtime trader-cycle hardcodes NBTC/NUSDC asset pair. Non-NBTC_NUSDC
  // pairs are accepted by the form but unsupported by the cycle today;
  // we still feed the global coin types so the agent boots and surfaces
  // a clearer "asset mismatch" failure than a missing-env crash.
  return {
    CAPABILITY_ID:           keyRow.capability_id,
    WALLET_ADDRESS:          keyRow.wallet_address,
    BUDGET_ID:               cfg.budgetId,
    ESCROW_ID:               escrowId,
    STRATEGY:                cfg.strategyPresetId ?? 'conservative_dca',
    MAX_NOTIONAL_QUOTE_RAW:  cfg.perTradeMaxQuoteRaw,
    DAILY_MAX_QUOTE_RAW:     cfg.dailyMaxQuoteRaw,
    MAX_SLIPPAGE_BPS:        String(cfg.maxSlippageBps ?? 50),
    INTERVAL_MINUTES:        String(cfg.intervalMinutes ?? 30),
  };
}

export async function spawnAgentPm2(opts: SpawnOptions): Promise<void> {
  assertSafeName(opts.pm2Name);

  // Resolve all per-agent + global trader env BEFORE invoking pm2 so a
  // partial-config row fails fast and pm2 never adopts an idle process.
  const perAgent = await perAgentTraderEnv(opts.agentAddress);
  const globalEnv = globalTraderEnv();

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
      ...globalEnv,
      ...perAgent,
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
