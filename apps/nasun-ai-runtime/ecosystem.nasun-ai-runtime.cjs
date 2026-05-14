/**
 * PM2 ecosystem config for nasun-ai-runtime.
 *
 * Migrated from apps/baram/agent-runner/ecosystem.agent-runner.cjs (S2).
 * Process name changed from `baram-trader` to `nasun-ai-runtime`.
 *
 * Long-running single mode (Plan D D-3):
 *   - Self-schedules heartbeat trader cycles via setTimeout.
 *   - /wake HTTP server (127.0.0.1:WAKE_PORT) accepts inbound triggers
 *     (user_message, manual) signed by chat-server.
 *   - No PM2 cron.
 *
 * Idempotency store: ~/.nasun-ai-runtime/processed_jobs.db.
 *   For prod cutover from baram-trader, copy the previous DB:
 *     cp -i ~/.baram-agent-runner/processed_jobs.db ~/.nasun-ai-runtime/processed_jobs.db
 *   (or set IDEMPOTENCY_DB_PATH if a constructor override is wired later).
 */

'use strict';

module.exports = {
  apps: [
    {
      name: 'nasun-ai-runtime',
      script: 'src/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      env: {
        PRESET: 'trader',
        INTERVAL_MINUTES: '30',

        // Plan D D-3: inbound /wake endpoint port (127.0.0.1 only).
        WAKE_PORT: '4400',

        // --- Fill in before deploying ---
        // BARAM_PACKAGE_ID:     '',
        // BARAM_REGISTRY_ID:    '',
        // BARAM_AER_PACKAGE_ID: '',
        // BUDGET_ID:            '',
        // AGENT_PRIVATE_KEY:    '',
        // EXECUTOR_ADDRESS:     '',
        // BARAM_API_KEY:        '',
        // HOST_URL:             '',
        // CAPABILITY_ID:        '',
        // WALLET_ADDRESS:       '',
        // ESCROW_ID:            '',
        // COIN_NUSDC_TYPE:      '',
        // COIN_NBTC_TYPE:       '',

        // Shared with nasun-website chat-server (identical secret values).
        // BARAM_SESSION_JWT_SECRET:     '',
        // BARAM_CHAT_SERVER_HMAC_SECRET:'',

        // Optional Telegram notifications on AER landing.
        // TELEGRAM_BOT_TOKEN:  '',
        // TELEGRAM_CHAT_ID:    '',

        RPC_URL: 'https://rpc.devnet.nasun.io',
        NODE_ENV: 'production',
      },
    },
  ],
};
