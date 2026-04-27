/**
 * PM2 Ecosystem Configuration for GoStop Bots
 *
 * Currently runs:
 *   - lottery-keeper: weekly 5-of-25 lottery lifecycle automation
 *
 * Usage:
 *   pm2 startOrRestart ecosystem.config.cjs
 *   pm2 logs gostop-lottery-keeper
 *
 * Required .env (sourced before pm2 start by deploy script):
 *   LOTTERY_ADMIN_KEY=<admin-hex-or-suiprivkey>   # owns LotteryAdminCap
 *
 * Optional overrides (defaults baked into lib/lottery-config.ts):
 *   NASUN_RPC_URL, LOTTERY_PACKAGE_ID, LOTTERY_REGISTRY_ID,
 *   LOTTERY_ADMIN_CAP_ID, BANKROLL_POOL_ID,
 *   LOTTERY_CLOSE_DAY, LOTTERY_CLOSE_HOUR, LOTTERY_DRAW_OFFSET_MS
 */

module.exports = {
  apps: [
    {
      name: 'gostop-lottery-keeper',
      script: './node_modules/.bin/tsx',
      args: 'lottery-keeper.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
      },
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 10000,
      kill_timeout: 15000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/gostop-lottery-keeper-error.log',
      out_file: './logs/gostop-lottery-keeper-out.log',
      merge_logs: true,
      max_memory_restart: '200M',
    },
  ],
};
