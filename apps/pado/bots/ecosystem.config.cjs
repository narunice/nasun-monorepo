/**
 * PM2 Ecosystem Configuration for LP Bot
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs lp-bot
 *   pm2 stop lp-bot
 *   pm2 restart lp-bot
 *
 * Before starting, set the LP_PRIVATE_KEY environment variable:
 *   export LP_PRIVATE_KEY=<your-hex-key>
 */

module.exports = {
  apps: [
    {
      name: 'lp-bot',
      script: './node_modules/.bin/tsx',
      args: 'lp-bot.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        // Spread and order settings
        LP_SPREAD_BPS: '30',           // 0.3% spread
        LP_ORDER_LEVELS: '5',          // 5 orders per side
        LP_ORDER_SIZE: '0.01',         // 0.01 BTC per order
        LP_UPDATE_INTERVAL: '10000',   // 10 seconds
        LP_REQUOTE_THRESHOLD: '50',    // Re-quote at 0.5% price move
        // Inventory management
        LP_REFILL_THRESHOLD_NBTC: '0.5',
        LP_REFILL_THRESHOLD_NUSDC: '50000',
        // Risk controls
        LP_MAX_ORDER_SIZE: '0.1',
        LP_MIN_SPREAD_BPS: '10',
        LP_MAX_FAILURES: '5',
        LP_MIN_PRICE: '50000',
        LP_MAX_PRICE: '200000',
      },
      // Restart settings
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/lp-bot-error.log',
      out_file: './logs/lp-bot-out.log',
      merge_logs: true,
      // Resource limits
      max_memory_restart: '500M',
    },
    {
      name: 'price-updater',
      script: './node_modules/.bin/tsx',
      args: 'price-updater.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/price-updater-error.log',
      out_file: './logs/price-updater-out.log',
      merge_logs: true,
    },
  ],
};
