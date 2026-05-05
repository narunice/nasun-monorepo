module.exports = {
  apps: [
    {
      name: 'nasun-chat-server',
      script: 'dist/server.js',
      max_memory_restart: '700M',
      node_args: '--max-old-space-size=450',  // must be < max_memory_restart (RSS) so PM2 triggers before OOM crash
      kill_timeout: 105000,                   // crash drain budget 90s + parent grace 95s + 10s margin (see crash/constants.ts)
      wait_ready: false,
      max_restarts: 15,
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      autorestart: true,
      env: {
        PORT: '3101',
        ALLOWED_ORIGINS: 'https://nasun.io,https://www.nasun.io,https://pado.finance,https://www.pado.finance,https://gostop.app,https://www.gostop.app',
        TRUST_PROXY: 'true',
        CHAT_DB_PATH: './data/chat.db',
        LEADERBOARD_DB_PATH: './data/leaderboard.db',
        CRASH_HISTORY_DB_PATH: './data/crash-history.db',
        RPC_URL: 'https://rpc.devnet.nasun.io',
        INDEXER_POLL_INTERVAL_MS: '5000',
        AGGREGATION_INTERVAL_MS: '60000',
        NASUN_PROFILE_API_URL: 'https://aanboqet5i.execute-api.ap-northeast-2.amazonaws.com/prod',
        GENESIS_PASS_API_URL: 'https://hntjvkuyvk.execute-api.ap-northeast-2.amazonaws.com/prod',
        DEEPBOOK_PACKAGE: '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134',
        POOL_NBTC_NUSDC: '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0',
        POOL_NASUN_NUSDC: '0x5953740daf54d767f2cd71a8372db75c7277f2907b55e0bdf7c172d96e033b1e',
        POOL_NETH_NUSDC: '0xb6c960985711cf5a9cc5063cec8c7ad148794e4cb3c1ad1cea224911cd68e7b7',
        POOL_NSOL_NUSDC: '0x577f81bb5dae12aac57103ed0231aae200af3ac1c5db3d523b679b09ac88c769',
        // INDEXER_EXCLUDED_ADDRESSES intentionally NOT listed here so the value
        // sourced from .env (via `set -a && source .env && set +a` before
        // `pm2 startOrRestart`) reaches the process. Listing it with a
        // placeholder previously shadowed the .env value and silently no-op'd
        // bot exclusion (2026-05-05 — discovered when prediction-market LP bot
        // pair kept appearing on the weekly leaderboard despite .env update).
        // Secrets (TURNSTILE_SECRET_KEY, INTERNAL_API_KEY, ANTHROPIC_API_KEY): set in .env on server
      },
    },
  ],
};
