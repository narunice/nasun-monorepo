/**
 * PR2.A — Per-agent PM2 process template.
 *
 * Spawned by chat-server orchestrator (agent-orchestrator.ts) for each
 * activated agent. The orchestrator overrides --name to
 * `nasun-ai-agent-<sha8>` and injects three env vars:
 *   - AGENT_SECRET_PARAM=/nasun/ai-agent/<addr>  (SSM Parameter to fetch)
 *   - AGENT_ADDRESS=0x...
 *   - WAKE_PORT=4401|4402|...
 *
 * The remaining env (BARAM_PACKAGE_ID, RPC_URL, EXECUTOR_ADDRESS, etc.)
 * is sourced from the legacy ecosystem.nasun-ai-runtime.cjs so we do not
 * duplicate values in two places. AGENT_PRIVATE_KEY is intentionally
 * removed — keypair lives only inside the spawned process closure,
 * fetched from SSM Parameter Store at startup via loadKeypairFromParam.
 */

'use strict';

const path = require('node:path');
const baseEcosystem = require('./ecosystem.nasun-ai-runtime.cjs');
const baseEnv = baseEcosystem.apps[0].env || {};

// Strip AGENT_PRIVATE_KEY (and WAKE_PORT — orchestrator sets per-agent).
const sharedEnv = Object.fromEntries(
  Object.entries(baseEnv).filter(([k]) => k !== 'AGENT_PRIVATE_KEY' && k !== 'WAKE_PORT'),
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
        ...sharedEnv,
        NODE_ENV: 'production',
        PRESET: 'trader',
        // Orchestrator-injected at spawn:
        AGENT_SECRET_PARAM: process.env.AGENT_SECRET_PARAM,
        AGENT_ADDRESS: process.env.AGENT_ADDRESS,
        WAKE_PORT: process.env.WAKE_PORT,
      },
    },
  ],
};
