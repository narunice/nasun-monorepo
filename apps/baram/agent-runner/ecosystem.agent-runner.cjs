/**
 * PM2 ecosystem config for Baram agent-runner.
 *
 * Plan D D-3 (long-running single mode):
 *   - The runner self-schedules heartbeat trader cycles via setTimeout.
 *   - A `/wake` HTTP server (127.0.0.1:WAKE_PORT) accepts inbound triggers
 *     (user_message, manual) signed by chat-server.
 *   - No PM2 cron involvement; cron tooling is retired with D-3.
 */

'use strict';

module.exports = {
  apps: [
    {
      name: 'baram-trader',
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
