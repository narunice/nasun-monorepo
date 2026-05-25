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
import { writeFile, unlink } from 'node:fs/promises';
import { getDb } from './store.js';
import { fetchCapabilityEscrowId } from './sui-capability-utils.js';
import { readAgentProfileIsActive, invalidateAgentProfileCache } from './sui-client.js';

const exec = promisify(execFile);

const PM2_BIN = process.env.PM2_BIN ?? '/usr/bin/pm2';
const PM2_HOME = process.env.PM2_HOME ?? '/home/ec2-user/.pm2';
const RUNTIME_CWD = process.env.NASUN_AI_RUNTIME_CWD ?? '/home/ec2-user/nasun-ai-runtime';
// Per-spawn ecosystem config files are written to RUNTIME_CWD at spawn time
// with env values baked in as JSON literals (not process.env[k] references).
// Reason: pm2's daemon — not the CLI — resolves the env block at spawn time.
// Even though execFile passes env to the pm2 CLI subprocess, the daemon
// re-evaluates the config file in its own context, where the orchestrator's
// per-agent secrets are absent. Baking literals into the config sidesteps
// pm2's env-propagation gotcha entirely.
//
// Filename must end in `.config.cjs` so pm2 auto-detects ecosystem mode;
// otherwise pm2 falls back to script mode, runs the file as a regular Node
// module (apps[] becomes module.exports), and never executes src/index.ts.
const spawnConfigPath = (pm2Name: string): string =>
  `${RUNTIME_CWD}/spawn-${pm2Name}.config.cjs`;

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
  /** User-facing label ("Santa", "Jane"). Forwarded to runtime as
   *  AGENT_NAME so trade-notification messages can disambiguate multiple
   *  agents in the same Telegram chat (2026-05-23 misattribution: a
   *  trade from Santa was credited to Jane because notify.ts had only
   *  the strategy in its header). */
  name?: string;
}

/**
 * Trader env vars that are identical across every spawned agent. Sourced
 * from chat-server's process.env. AGENT_GLOBAL_ prefix is used for vars
 * introduced for this orchestrator path so an operator looking at the
 * chat-server .env can tell at a glance which vars feed the spawned
 * agents vs. chat-server itself. Already-shared secrets (HMAC, JWT,
 * RPC_URL) are inherited under their canonical names with no prefix.
 */
// 2026-05-25 incident: a single hard-coded EXECUTOR_ADDRESS meant every
// spawned agent routed every AER+swap PTB to the same on-chain executor,
// which drained that one wallet's gas while three sibling executors sat at
// ~10-37k NSN unused. The Lambda's heartbeat fix (139b1fa2) only resolves
// "all 4 dormant" — it doesn't load-balance picks. Splitting the env var
// into a comma list and choosing one per spawn distributes traffic across
// the executor pool. Random (not RR-counter) so we don't need persistent
// orchestrator state, and spawn churn is low enough that uniform random
// converges to even distribution quickly.
function pickExecutorAddress(): string {
  const raw = process.env.AGENT_GLOBAL_EXECUTOR_ADDRESS
              ?? process.env.EXECUTOR_ADDRESS
              ?? '';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) {
    throw new Error('missing_global_trader_env:AGENT_GLOBAL_EXECUTOR_ADDRESS');
  }
  return list[Math.floor(Math.random() * list.length)];
}

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
    EXECUTOR_ADDRESS:     pickExecutorAddress(),
    HOST_URL:             pick('HOST_URL'),
    COIN_NBTC_TYPE:       pick('COIN_NBTC_TYPE'),
    COIN_NUSDC_TYPE:      pick('COIN_NUSDC_TYPE'),
    CHAT_SERVER_BASE_URL: process.env.AGENT_GLOBAL_CHAT_SERVER_BASE_URL
                          ?? 'http://127.0.0.1:3101',
    RPC_URL:              process.env.RPC_URL ?? 'https://rpc.devnet.nasun.io',
    BARAM_CHAT_SERVER_HMAC_SECRET: pick('BARAM_CHAT_SERVER_HMAC_SECRET'),
    BARAM_SESSION_JWT_SECRET:      pick('BARAM_SESSION_JWT_SECRET'),
    // PR1.5 swap path gate (L1 / runtime side). Defaults to 'true' so a
    // chat-server with no override still spawns HOLD-only agents. Operator
    // flips AGENT_GLOBAL_PR1A_SWAP_DISABLED=false in chat-server .env to
    // enable BUY/SELL submission against the Lambda swap path.
    PR1A_SWAP_DISABLED:
      process.env.AGENT_GLOBAL_PR1A_SWAP_DISABLED
      ?? process.env.PR1A_SWAP_DISABLED
      ?? 'true',
  };
  // Per-request inference fee paid into the AER envelope, in NUSDC raw
  // (6 dec). Chat-server's .env is the fleet-wide SSOT so a single edit +
  // respawn applies to every agent. When unset we deliberately do NOT
  // forward PRICE: the runtime's own config default (100_000 = 0.1 NUSDC,
  // apps/nasun-ai-runtime/src/config.ts) becomes the floor. This keeps the
  // runtime .env from silently overriding fleet policy (pre-2026-05-24
  // incident: prod runtime .env carried a stale PRICE=1000000 long after
  // the code default was lowered, so every AER kept charging 1.0 NUSDC).
  const inferencePriceRaw =
    process.env.AGENT_GLOBAL_PRICE ?? process.env.INFERENCE_PRICE_RAW;
  if (inferencePriceRaw) out.PRICE = inferencePriceRaw;
  // Operator-facing AER heartbeat watchdog alerts. When ALERT_CHAT_ID is
  // unset the runtime logs stalls but does not send a Telegram message.
  // User-facing trade notifications are delivered via the wake-forwarding
  // bot (BARAM_TG_*), not from the agent runtime directly.
  if (process.env.AGENT_TELEGRAM_ALERT_BOT_TOKEN) {
    out.TELEGRAM_ALERT_BOT_TOKEN = process.env.AGENT_TELEGRAM_ALERT_BOT_TOKEN;
  }
  if (process.env.AGENT_TELEGRAM_ALERT_CHAT_ID) {
    out.TELEGRAM_ALERT_CHAT_ID = process.env.AGENT_TELEGRAM_ALERT_CHAT_ID;
  }
  if (process.env.AGENT_AER_HEARTBEAT_STALE_MIN) {
    out.AER_HEARTBEAT_STALE_MIN = process.env.AGENT_AER_HEARTBEAT_STALE_MIN;
  }
  if (process.env.AGENT_AER_HEARTBEAT_COOLDOWN_MIN) {
    out.AER_HEARTBEAT_COOLDOWN_MIN = process.env.AGENT_AER_HEARTBEAT_COOLDOWN_MIN;
  }
  // General-chat preset (2026-05-23). Forwarded only when present so
  // operators with no LLM credentials still spawn agents that soft-fail
  // chat to a canned reply (see apps/nasun-ai-runtime/src/presets/chat.ts).
  // Trading-intent user_messages keep running through the analyst path
  // even without these vars; only free-form chit-chat depends on them.
  const llmApiUrl = process.env.AGENT_GLOBAL_LLM_API_URL ?? process.env.LLM_API_URL;
  const llmApiKey = process.env.AGENT_GLOBAL_LLM_API_KEY ?? process.env.LLM_API_KEY;
  if (llmApiUrl) out.LLM_API_URL = llmApiUrl;
  if (llmApiKey) out.LLM_API_KEY = llmApiKey;
  if (process.env.AGENT_GLOBAL_LLM_MODEL ?? process.env.LLM_MODEL) {
    out.LLM_MODEL = (process.env.AGENT_GLOBAL_LLM_MODEL ?? process.env.LLM_MODEL) as string;
  }
  // ANTHROPIC_API_KEY is intentionally NOT forwarded: it is reserved
  // for Pado's Wavi chatbot (chat-server's ai-chatbot.ts) and must not
  // be consumed by Nasun AI trading agents. Chat uses the free-tier
  // pool below instead.
  //
  // Multi-provider rotation pool (preferred). JSON array of
  // {name, url, key, model} read at runtime startup; round-robin +
  // 60s cooldown on failures. Operator stores this in chat-server's
  // .env as a single (long) line to avoid shell-escaping the keys.
  const chatLlmProviders =
    process.env.AGENT_GLOBAL_CHAT_LLM_PROVIDERS ?? process.env.CHAT_LLM_PROVIDERS;
  if (chatLlmProviders) out.CHAT_LLM_PROVIDERS = chatLlmProviders;
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
    `SELECT capability_id, wallet_address, profile_id
     FROM agent_keys
     WHERE agent_address = ? AND deleted_at IS NULL`,
  ).get(lower) as { capability_id: string | null; wallet_address: string; profile_id: string | null } | undefined;
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
    // User-facing label for Telegram notifications. Truncated to 24
    // chars so emoji-laden names cannot blow past Telegram message
    // header budget. Empty string when missing so the runtime can
    // fall back to a strategy-only header.
    AGENT_NAME:              (cfg.name ?? '').slice(0, 24),
    MAX_NOTIONAL_QUOTE_RAW:  cfg.perTradeMaxQuoteRaw,
    DAILY_MAX_QUOTE_RAW:     cfg.dailyMaxQuoteRaw,
    MAX_SLIPPAGE_BPS:        String(cfg.maxSlippageBps ?? 50),
    INTERVAL_MINUTES:        String(cfg.intervalMinutes ?? 30),
    // Explicit opt-in for the runtime → chat-server heartbeat push channel.
    // Standalone single-daemon (ecosystem.nasun-ai-runtime.cjs) leaves this
    // unset so operator daemons do not accidentally push to a user chat.
    HEARTBEAT_PUSH_ENABLED:  'true',
    // AER v3 attribution. Optional: omit when not stored so the runtime falls
    // back to agent_profile_id=null (backward-compatible with v2 rows).
    ...(keyRow.profile_id ? { AGENT_PROFILE_ID: keyRow.profile_id } : {}),
  };
}

/**
 * Phase 6 enabled-gate (2026-05-23). Read the trader config's `enabled`
 * flag straight from SQLite; throw a typed error before any pm2 invocation
 * if the agent should not be running. Pairs with the runtime self-suicide
 * gate (apps/nasun-ai-runtime/src/self-config.ts) — orchestrator side
 * refuses to start at all, runtime side kills itself if it ever does.
 *
 * Callers that legitimately tolerate a disabled-state spawn refusal
 * (vault upload, vault restore, admin respawn-all) use
 * `instanceof AgentDisabledError` to distinguish from real failures.
 */
export class AgentDisabledError extends Error {
  constructor(public readonly agentAddress: string) {
    super(`agent_disabled:${agentAddress}`);
    this.name = 'AgentDisabledError';
  }
}

function readEnabledFlag(agentAddress: string): boolean {
  const row = getDb().prepare(
    `SELECT config_json FROM nasun_ai_trader_configs WHERE agent_address = ?`,
  ).get(agentAddress.toLowerCase()) as { config_json: string } | undefined;
  if (!row) return false;
  try {
    const parsed = JSON.parse(row.config_json) as { enabled?: unknown };
    return parsed.enabled === true;
  } catch {
    return false;
  }
}

export async function spawnAgentPm2(opts: SpawnOptions): Promise<void> {
  assertSafeName(opts.pm2Name);

  // Phase 6: orchestrator-side enabled gate. The whole point of this
  // refactor is that the user's `enabled:false` toggle must be binding.
  // Without this check, callers (vault upload, respawn-all, etc.) would
  // still spawn agents that the user has explicitly disabled.
  if (!readEnabledFlag(opts.agentAddress)) {
    throw new AgentDisabledError(opts.agentAddress.toLowerCase());
  }

  // Resolve all per-agent + global trader env BEFORE invoking pm2 so a
  // partial-config row fails fast and pm2 never adopts an idle process.
  const perAgent = await perAgentTraderEnv(opts.agentAddress);
  const globalEnv = globalTraderEnv();

  const envBlock: Record<string, string> = {
    NODE_ENV: 'production',
    PRESET: 'trader',
    // SSM keypair fetch requires AWS_REGION on the agent's process.env.
    // chat-server itself has it; we forward explicitly because the baked-
    // env approach (vs the prior process.env-passthrough template) means
    // nothing leaks in by accident.
    AWS_REGION: process.env.AWS_REGION ?? 'ap-northeast-2',
    PM2_AGENT_NAME: opts.pm2Name,
    AGENT_SECRET_PARAM: opts.paramName,
    AGENT_ADDRESS: opts.agentAddress,
    WAKE_PORT: String(opts.wakePort),
    // AGENT_PRIVATE_KEY intentionally absent — keypair lives only inside
    // the spawned process closure, fetched from SSM on startup.
    ...globalEnv,
    ...perAgent,
    // Explicit blocklist (override anything that may leak via
    // `pm2 --update-env` from chat-server's process.env). Without this,
    // ANTHROPIC_API_KEY shows up in every spawned trading agent because
    // chat-server's process has it loaded for the Wavi chatbot. Empty
    // string here forces pm2 to write a present-but-empty var into the
    // child's env, which `config.anthropicApiKey ?? ''` evaluates as
    // not-set in the runtime config. 2026-05-23: ANTHROPIC_* is reserved
    // for Pado Wavi and must never reach the trading agent.
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: '',
  };

  const configBody = `// Auto-generated per-spawn pm2 ecosystem file. Safe to delete after pm2\n`
    + `// has adopted the process. Env values are baked in as literals so the\n`
    + `// pm2 daemon does not need to resolve process.env at parse time (see\n`
    + `// agent-orchestrator.ts header comment for context).\n`
    + `'use strict';\n`
    + `const path = require('node:path');\n`
    + `module.exports = ${JSON.stringify({
      apps: [{
        name: opts.pm2Name,
        script: 'src/index.ts',
        interpreter: 'npx',
        interpreter_args: 'tsx',
        cwd: RUNTIME_CWD,
        autorestart: true,
        watch: false,
        max_memory_restart: '512M',
        min_uptime: '30s',
        max_restarts: 5,
        // PR2.A.1.b debug: stdout captured to a per-agent file while we
        // verify env propagation end-to-end. Original template suppressed
        // stdout to keep keypair-adjacent log lines off the pm2 daemon's
        // log stream; revisit once dogfood is stable.
        out_file: `${PM2_HOME}/logs/${opts.pm2Name}-out.log`,
        error_file: `${PM2_HOME}/logs/${opts.pm2Name}-error.log`,
        env: envBlock,
      }],
    }, null, 2)};\n`;

  const configPath = spawnConfigPath(opts.pm2Name);
  // mode 0600 — file contains BARAM_API_KEY and JWT/HMAC secrets while it
  // lives. pm2 reads it once at start; we unlink in finally.
  await writeFile(configPath, configBody, { mode: 0o600 });

  try {
    await exec(PM2_BIN, [
      'start', configPath,
      '--update-env',
    ], {
      cwd: RUNTIME_CWD,
      env: pm2Env(),
      timeout: 15_000,
    });
  } finally {
    await unlink(configPath).catch(() => { /* best-effort cleanup */ });
  }

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

// === Phase 8 (2026-05-24) ===
// Reconcile PM2 state with the user's combined intent: on-chain
// AgentProfile.is_active (kill axis) + config.enabled (pause axis).
// Replaces the Phase 6 reconcilePm2State which only knew about the
// server-side enabled flag.
//
// State derivation (inline):
//   is_active=true,  enabled=true  → activated  (PM2 should run)
//   is_active=true,  enabled=false → paused     (PM2 should stop)
//   is_active=false, *             → killed     (PM2 should stop, no auto vault delete)
//   is_active=null (RPC fail)      → unknown    (no state change)
//
// Vault soft-delete is the explicit responsibility of DELETE /vault/agent/:addr,
// never an auto-action here. A transient RPC failure that misread is_active
// must not destroy a healthy vault row.

export type AgentState = 'activated' | 'paused' | 'killed' | 'unknown';

export interface AgentStateResult {
  state: AgentState;
  runtime: 'running' | 'stopped';
  reason: string;
  /** PM2 action actually taken this call. 'noop' includes "already in target state". */
  action: 'spawn' | 'stop' | 'noop';
  /** True when on-chain RPC failed or profile_id is missing — caller may surface "syncing..." */
  pending: boolean;
}

export interface ReconcileInputs {
  /** On-chain AgentProfile.is_active. null = RPC failure or profile_id missing. */
  isActive: boolean | null;
  /** chat-server config.enabled (inside config_json JSON blob). */
  enabled: boolean;
  /** agent_keys row present AND deleted_at IS NULL. */
  hasActiveVault: boolean;
  pm2NameKnown: string | null;
  pm2NamesInList: ReadonlySet<string>;
}

/** Pure decision function — testable without pm2 / RPC / SQLite. */
export function deriveAgentState(inputs: ReconcileInputs): {
  state: AgentState;
  desiredRunning: boolean;
  reason: string;
} {
  if (inputs.isActive === null) {
    // RPC unknown — make no inference. PM2 should stay as-is.
    return { state: 'unknown', desiredRunning: false, reason: 'on_chain_unknown' };
  }
  if (!inputs.isActive) {
    return { state: 'killed', desiredRunning: false, reason: 'on_chain_inactive' };
  }
  // is_active === true
  if (!inputs.hasActiveVault) {
    // On-chain says active but no vault row to spawn from. Treat as paused
    // (PM2 cannot run, but agent is not killed). Vault upload restores.
    return { state: 'paused', desiredRunning: false, reason: 'no_active_vault_row' };
  }
  if (!inputs.enabled) {
    return { state: 'paused', desiredRunning: false, reason: 'enabled_false' };
  }
  return { state: 'activated', desiredRunning: true, reason: 'enabled_true' };
}

// Serial queue per agentAddress so concurrent config saves cannot race
// pm2 spawn/stop (the underlying CLI is not concurrency-safe per name).
const reconcileQueues = new Map<string, Promise<unknown>>();
export async function withAgentLock<T>(agentAddress: string, fn: () => Promise<T>): Promise<T> {
  const key = agentAddress.toLowerCase();
  const prev = reconcileQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  reconcileQueues.set(key, next);
  try {
    return await next;
  } finally {
    if (reconcileQueues.get(key) === next) reconcileQueues.delete(key);
  }
}

interface VaultRow {
  pm2_name: string;
  param_name: string;
  wake_port: number;
  profile_id: string | null;
  deleted_at: number | null;
}

function readVaultRow(agentAddress: string): VaultRow | null {
  const row = getDb().prepare(
    `SELECT pm2_name, param_name, wake_port, profile_id, deleted_at
       FROM agent_keys
      WHERE agent_address = ?
      ORDER BY (deleted_at IS NULL) DESC, COALESCE(deleted_at, created_at) DESC
      LIMIT 1`,
  ).get(agentAddress.toLowerCase()) as VaultRow | undefined;
  return row ?? null;
}

/**
 * Bring PM2 to the state the user's combined on-chain + server-side intent
 * dictates. Idempotent; concurrent calls for the same agent are serialized
 * via withAgentLock.
 *
 * NEVER soft-deletes the vault row. Killed state stops PM2; vault deletion
 * is the explicit responsibility of DELETE /api/nasun-ai/vault/agent/:addr,
 * which the frontend calls after the user signs the on-chain deactivate tx.
 */
export async function reconcileAgentState(
  agentAddress: string,
  /**
   * Optional pre-fetched pm2 process names. The drift poller fetches once
   * per tick and passes the same snapshot to every reconcile so we don't
   * fork `pm2 jlist` N times in a row.
   */
  pm2Snapshot?: ReadonlySet<string>,
): Promise<AgentStateResult> {
  const lower = agentAddress.toLowerCase();
  return withAgentLock(lower, async () => {
    const vault = readVaultRow(lower);
    const hasActiveVault = Boolean(vault && vault.deleted_at === null);
    const enabled = readEnabledFlag(lower);
    const names = pm2Snapshot
      ?? new Set((await pm2List().catch(() => [] as Pm2ProcessLite[])).map(p => p.name));

    // On-chain read. profile_id may be NULL for legacy rows that predate
    // the AER v3 backfill (store.ts:271). In that case we cannot know
    // is_active and must return 'unknown'.
    let isActive: boolean | null = null;
    if (vault?.profile_id) {
      const snapshot = await readAgentProfileIsActive(vault.profile_id);
      isActive = snapshot?.isActive ?? null;
    }

    const decision = deriveAgentState({
      isActive,
      enabled,
      hasActiveVault,
      pm2NameKnown: vault?.pm2_name ?? null,
      pm2NamesInList: names,
    });

    const pm2NameKnown = vault?.pm2_name ?? null;
    const initiallyInList = pm2NameKnown ? names.has(pm2NameKnown) : false;
    let action: AgentStateResult['action'] = 'noop';
    let actionReason = decision.reason;
    // True iff PM2 is expected to be running after this tick. Reflects the
    // ACTUAL outcome: a spawn that threw leaves the runtime stopped.
    let runtimeRunning = initiallyInList;

    if (decision.state === 'unknown') {
      return {
        state: 'unknown',
        runtime: initiallyInList ? 'running' : 'stopped',
        reason: decision.reason,
        action: 'noop',
        pending: true,
      };
    }

    if (decision.desiredRunning && !initiallyInList && hasActiveVault && vault) {
      try {
        await spawnAgentPm2({
          agentAddress: lower,
          pm2Name: vault.pm2_name,
          paramName: vault.param_name,
          wakePort: vault.wake_port,
        });
        action = 'spawn';
        runtimeRunning = true;
      } catch (err) {
        action = 'spawn';
        actionReason = `spawn_failed:${(err as Error).message}`;
        runtimeRunning = false;
      }
    } else if (!decision.desiredRunning && initiallyInList && pm2NameKnown) {
      try {
        await stopAgentPm2(pm2NameKnown);
        action = 'stop';
        runtimeRunning = false;
      } catch (err) {
        action = 'stop';
        actionReason = `stop_failed:${(err as Error).message}`;
        runtimeRunning = true;  // stop failed → still running
      }
    }

    return {
      state: decision.state,
      runtime: runtimeRunning ? 'running' : 'stopped',
      reason: actionReason,
      action,
      pending: false,
    };
  });
}

/**
 * Lightweight read-only snapshot for the GET state endpoint. Re-uses the
 * same derivation as reconcileAgentState but does not invoke pm2 actions.
 * Cache-friendly: callers may invoke this on every browser poll.
 */
export interface AgentStateSnapshot {
  state: AgentState;
  runtime: 'running' | 'stopped';
  onChain: { isActive: boolean | null; profileId: string | null };
  config: { enabled: boolean };
  /** Vault presence only — deleted_at timestamp is intentionally omitted
   *  from the public response to avoid leaking account-lifecycle timing. */
  vault: { present: boolean };
  pending: boolean;
}

export async function readAgentStateSnapshot(agentAddress: string): Promise<AgentStateSnapshot> {
  const lower = agentAddress.toLowerCase();
  const vault = readVaultRow(lower);
  const hasActiveVault = Boolean(vault && vault.deleted_at === null);
  const enabled = readEnabledFlag(lower);
  const list = await pm2List().catch(() => [] as Pm2ProcessLite[]);
  const names = new Set(list.map(p => p.name));

  let isActive: boolean | null = null;
  if (vault?.profile_id) {
    const snapshot = await readAgentProfileIsActive(vault.profile_id);
    isActive = snapshot?.isActive ?? null;
  }

  const decision = deriveAgentState({
    isActive,
    enabled,
    hasActiveVault,
    pm2NameKnown: vault?.pm2_name ?? null,
    pm2NamesInList: names,
  });

  return {
    state: decision.state,
    runtime: (vault?.pm2_name && names.has(vault.pm2_name)) ? 'running' : 'stopped',
    onChain: { isActive, profileId: vault?.profile_id ?? null },
    config: { enabled },
    vault: { present: hasActiveVault },
    pending: decision.state === 'unknown',
  };
}

/** Caller-driven cache invalidation (e.g. after wallet signs a deactivate tx). */
export function invalidateAgentOnChainCache(profileId: string): void {
  invalidateAgentProfileCache(profileId);
}

// === Phase 8 (2026-05-24) — on-chain drift poller ===
//
// Heals state drift caused by external wallet activity: a user can sign a
// deactivate_agent tx in another browser tab, a different device, or any
// wallet client; chat-server only learns about it on the next on-chain read.
// Reconcile is already invoked on every config save / vault op and on every
// browser GET /state, but a fully idle session could see a stopped agent
// keep running for an unbounded time. This poller bounds that to 60s.
//
// Implementation notes:
//   - Self-rescheduling setTimeout (not setInterval): a slow tick under
//     RPC degradation must not overlap with the next one. Overlapping
//     ticks would fan out N pm2 jlist forks + N reconciles per agent.
//   - Single pm2 jlist per tick, shared across all per-agent reconciles.
//   - The 10s sui-client TTL means agents with a recent GET /state hit
//     skip the network round-trip during this tick.
//   - An AgentDeactivated event subscription was considered (v2 plan
//     §8a-5) but skipped: the all-agent sweep is N≤99 RPCs/min worst
//     case and event indexing adds infra for marginal latency benefit.
//
// Scope: agents with an active vault row + a non-null profile_id (legacy
// rows are skipped — they cannot be reconciled without on-chain read; the
// backfill script clears legacy NULLs).

const DRIFT_POLL_INTERVAL_MS = 60_000;
let driftPollTimer: ReturnType<typeof setTimeout> | null = null;
let driftPollRunning = false;
let driftPollStopped = true;

async function driftPollTick(): Promise<void> {
  if (driftPollRunning) {
    // Previous tick still in flight — skip this scheduling and let the
    // outer loop reschedule once the in-flight tick completes.
    return;
  }
  driftPollRunning = true;
  const startedAt = Date.now();
  try {
    const rows = getDb().prepare(
      `SELECT agent_address FROM agent_keys
        WHERE deleted_at IS NULL AND profile_id IS NOT NULL`,
    ).all() as { agent_address: string }[];
    // One pm2 jlist for the whole sweep.
    const list = await pm2List().catch(() => [] as Pm2ProcessLite[]);
    const names = new Set(list.map(p => p.name));
    for (const row of rows) {
      try {
        await reconcileAgentState(row.agent_address, names);
      } catch (err) {
        console.warn(
          `[drift-poll] reconcile failed for ${row.agent_address}:`,
          (err as Error).message,
        );
      }
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed > DRIFT_POLL_INTERVAL_MS) {
      console.warn(
        `[drift-poll] tick took ${elapsed}ms over ${rows.length} agents — RPC may be degraded`,
      );
    }
  } catch (err) {
    console.error('[drift-poll] tick failed:', (err as Error).message);
  } finally {
    driftPollRunning = false;
  }
}

function scheduleNextDriftPoll(): void {
  if (driftPollStopped) return;
  driftPollTimer = setTimeout(async () => {
    await driftPollTick();
    scheduleNextDriftPoll();
  }, DRIFT_POLL_INTERVAL_MS);
  driftPollTimer.unref();
}

export function startAgentStateDriftPoller(): void {
  if (!driftPollStopped) return;
  driftPollStopped = false;
  scheduleNextDriftPoll();
}

export function stopAgentStateDriftPoller(): void {
  driftPollStopped = true;
  if (driftPollTimer) {
    clearTimeout(driftPollTimer);
    driftPollTimer = null;
  }
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
