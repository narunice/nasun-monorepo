/**
 * PM2 ecosystem config for Baram agent-runner.
 *
 * Wake Model (baram-trader-wake):
 *   Runs one trader cycle on each cron tick then exits.
 *   PM2 cron_restart fires the process on schedule; WAKE_MODEL=true
 *   tells the runner to exit after the first cycle instead of self-scheduling.
 *
 *   Adjust the cron expression and env block before deploying.
 *   Default: every 30 minutes.
 *
 * Long-running mode (baram-trader):
 *   Keeps the internal setTimeout loop alive. Use when you prefer the
 *   agent to self-schedule without PM2 cron involvement.
 */

'use strict';

module.exports = {
  apps: [
    {
      name: 'baram-trader-wake',
      script: 'src/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: __dirname,
      // Run one cycle then exit; PM2 restarts on the next cron tick.
      cron_restart: '*/30 * * * *',
      autorestart: false,
      watch: false,
      env: {
        PRESET: 'trader',
        WAKE_MODEL: 'true',

        // --- Fill in before deploying ---
        // BARAM_PACKAGE_ID:     '',
        // BARAM_REGISTRY_ID:    '',
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

        // Optional Telegram notifications on AER landing.
        // TELEGRAM_BOT_TOKEN:  '',
        // TELEGRAM_CHAT_ID:    '',

        RPC_URL: 'https://rpc.devnet.nasun.io',
        NODE_ENV: 'production',
      },
    },

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

        // --- Fill in before deploying ---
        // BARAM_PACKAGE_ID:     '',
        // BARAM_REGISTRY_ID:    '',
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

        // Optional Telegram notifications on AER landing.
        // TELEGRAM_BOT_TOKEN:  '',
        // TELEGRAM_CHAT_ID:    '',

        RPC_URL: 'https://rpc.devnet.nasun.io',
        NODE_ENV: 'production',
      },
    },
  ],
};
