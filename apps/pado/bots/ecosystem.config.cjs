/**
 * PM2 Ecosystem Configuration for Pado Bots
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs lp-bot-nbtc
 *   pm2 stop all
 *   pm2 restart all
 *
 * Before starting, set the LP_PRIVATE_KEY environment variable:
 *   export LP_PRIVATE_KEY=<your-hex-key>
 *
 * For TPSL Keeper, also set:
 *   export KEEPER_PRIVATE_KEY=<keeper-hex-key>
 *   export TPSL_API_KEY=<api-key>
 */

const COMMON_LP_ENV = {
  NODE_ENV: 'production',
  // Spread and order settings
  LP_SPREAD_BPS: '30',           // 0.3% spread
  LP_ORDER_LEVELS: '5',          // 5 orders per side
  LP_UPDATE_INTERVAL: '10000',   // 10 seconds
  LP_REQUOTE_THRESHOLD: '50',    // Re-quote at 0.5% price move
  // Risk controls
  LP_MIN_SPREAD_BPS: '10',
  LP_MAX_FAILURES: '5',
  // Gas management
  LP_GAS_REFILL_THRESHOLD: '0.5',
};

const COMMON_LP_OPTS = {
  script: './node_modules/.bin/tsx',
  args: 'lp-bot.ts',
  cwd: __dirname,
  interpreter: 'none',
  max_restarts: 10,
  restart_delay: 5000,
  exp_backoff_restart_delay: 100,
  log_date_format: 'YYYY-MM-DD HH:mm:ss',
  merge_logs: true,
  max_memory_restart: '500M',
};

module.exports = {
  apps: [
    // ==============================
    // LP Bots (one per market)
    // ==============================
    {
      ...COMMON_LP_OPTS,
      name: 'lp-bot-nbtc',
      env: {
        ...COMMON_LP_ENV,
        LP_MARKET: 'NBTC',
        LP_ORDER_SIZE: '0.01',          // 0.01 BTC per level
        LP_MAX_ORDER_SIZE: '0.1',
        LP_REFILL_THRESHOLD_BASE: '0.5',
        LP_REFILL_THRESHOLD_QUOTE: '50000',
        LP_MIN_PRICE: '50000',
        LP_MAX_PRICE: '200000',
      },
      error_file: './logs/lp-bot-nbtc-error.log',
      out_file: './logs/lp-bot-nbtc-out.log',
    },
    {
      ...COMMON_LP_OPTS,
      name: 'lp-bot-neth',
      env: {
        ...COMMON_LP_ENV,
        LP_MARKET: 'NETH',
        LP_ORDER_SIZE: '0.1',           // 0.1 ETH per level
        LP_MAX_ORDER_SIZE: '1.0',
        LP_REFILL_THRESHOLD_BASE: '5',
        LP_REFILL_THRESHOLD_QUOTE: '50000',
        LP_MIN_PRICE: '1000',
        LP_MAX_PRICE: '10000',
      },
      error_file: './logs/lp-bot-neth-error.log',
      out_file: './logs/lp-bot-neth-out.log',
    },
    {
      ...COMMON_LP_OPTS,
      name: 'lp-bot-nsol',
      env: {
        ...COMMON_LP_ENV,
        LP_MARKET: 'NSOL',
        LP_ORDER_SIZE: '10',            // 10 SOL per level
        LP_MAX_ORDER_SIZE: '100',
        LP_REFILL_THRESHOLD_BASE: '50',
        LP_REFILL_THRESHOLD_QUOTE: '50000',
        LP_MIN_PRICE: '10',
        LP_MAX_PRICE: '1000',
      },
      error_file: './logs/lp-bot-nsol-error.log',
      out_file: './logs/lp-bot-nsol-out.log',
    },

    // ==============================
    // Price Updater (single instance, all symbols)
    // ==============================
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

    // ==============================
    // TP/SL Keeper Bot
    // ==============================
    {
      name: 'tpsl-keeper',
      script: './node_modules/.bin/tsx',
      args: 'tpsl-keeper.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        TPSL_PORT: '4001',
      },
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/tpsl-keeper-error.log',
      out_file: './logs/tpsl-keeper-out.log',
      merge_logs: true,
      max_memory_restart: '300M',
    },
  ],
};
