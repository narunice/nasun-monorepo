/**
 * PR2.A.1 — Per-agent PM2 process template.
 *
 * Spawned by chat-server orchestrator (agent-orchestrator.ts) for each
 * activated agent. Every env value the runtime needs is explicitly
 * injected by the orchestrator via `execFile`'s env option; this file
 * intentionally does NOT inherit from ecosystem.nasun-ai-runtime.cjs
 * because the legacy daemon's resident env does not propagate to
 * spawn-time child processes.
 *
 * Orchestrator-injected vars (see globalTraderEnv + perAgentTraderEnv in
 * agent-orchestrator.ts):
 *   Per-agent:  AGENT_SECRET_PARAM, AGENT_ADDRESS, WAKE_PORT,
 *               CAPABILITY_ID, WALLET_ADDRESS, BUDGET_ID, ESCROW_ID,
 *               STRATEGY, MAX_NOTIONAL_QUOTE_RAW, DAILY_MAX_QUOTE_RAW,
 *               MAX_SLIPPAGE_BPS, INTERVAL_MINUTES
 *   Global:     BARAM_PACKAGE_ID, BARAM_REGISTRY_ID, BARAM_AER_PACKAGE_ID,
 *               BARAM_API_KEY, EXECUTOR_ADDRESS, HOST_URL, RPC_URL,
 *               CHAT_SERVER_BASE_URL, COIN_NBTC_TYPE, COIN_NUSDC_TYPE,
 *               BARAM_CHAT_SERVER_HMAC_SECRET, BARAM_SESSION_JWT_SECRET,
 *               (optional) TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * AGENT_PRIVATE_KEY is intentionally absent — the keypair lives only
 * inside the spawned process closure, fetched from SSM Parameter Store
 * at startup via loadKeypairFromParam.
 */

'use strict';

const path = require('node:path');

// Allow-list of env vars to forward from the pm2-daemon's spawn env to
// the spawned app. Listed explicitly so a future stray var on the
// chat-server process cannot leak into spawned agents.
const FORWARD_KEYS = [
  // Per-agent identity / vault
  'PM2_AGENT_NAME', 'AGENT_SECRET_PARAM', 'AGENT_ADDRESS', 'WAKE_PORT',
  // Per-agent trader config
  'CAPABILITY_ID', 'WALLET_ADDRESS', 'BUDGET_ID', 'ESCROW_ID',
  'STRATEGY', 'MAX_NOTIONAL_QUOTE_RAW', 'DAILY_MAX_QUOTE_RAW',
  'MAX_SLIPPAGE_BPS', 'INTERVAL_MINUTES',
  // Global trader env
  'BARAM_PACKAGE_ID', 'BARAM_REGISTRY_ID', 'BARAM_AER_PACKAGE_ID',
  'BARAM_API_KEY', 'EXECUTOR_ADDRESS', 'HOST_URL', 'RPC_URL',
  'CHAT_SERVER_BASE_URL', 'COIN_NBTC_TYPE', 'COIN_NUSDC_TYPE',
  'BARAM_CHAT_SERVER_HMAC_SECRET', 'BARAM_SESSION_JWT_SECRET',
  // Optional trader-cycle Telegram notifications
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
  // General-chat preset (2026-05-23). When present, non-trading
  // user_message wakes get a free-form LLM reply instead of being
  // forced into the trade JSON envelope. Soft-fails to a canned reply
  // when absent, so omitting these keeps the runtime safe.
  //
  // Preferred: multi-provider rotation pool (JSON env). Production uses
  // ~9 free-tier keys (Groq x3 + Cerebras + OpenRouter + DeepSeek +
  // Mistral + SambaNova + Gemini) so a single provider's per-minute
  // window doesn't brick chat for the next user.
  'CHAT_LLM_PROVIDERS',
  // OpenAI-compat single-key fallback for minimal configs. ANTHROPIC_*
  // is intentionally NOT forwarded -- those keys are Pado-Wavi-only.
  'LLM_API_URL', 'LLM_API_KEY', 'LLM_MODEL',
];

const forwarded = Object.fromEntries(
  FORWARD_KEYS
    .map((k) => [k, process.env[k]])
    .filter(([, v]) => v !== undefined && v !== ''),
);

module.exports = {
  apps: [
    {
      name: process.env.PM2_AGENT_NAME || 'nasun-ai-agent-template',
      script: 'src/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      min_uptime: '30s',
      max_restarts: 5,
      // PR2.A A8: stdout suppress to avoid keypair-adjacent log lines being
      // captured by pm2 daemon. Errors still go to a per-agent file so we
      // can debug spawn failures without losing the trail.
      out_file: '/dev/null',
      error_file: path.join(
        process.env.PM2_HOME || `${process.env.HOME}/.pm2`,
        'logs',
        `${process.env.PM2_AGENT_NAME || 'nasun-ai-agent-template'}-error.log`,
      ),
      env: {
        NODE_ENV: 'production',
        PRESET: 'trader',
        ...forwarded,
      },
    },
  ],
};
