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
  // Order depth (30 levels per side = 60 total orders)
  LP_ORDER_LEVELS: '30',
  LP_UPDATE_INTERVAL: '10000',   // 10 seconds
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
        // Tight spread for main market (~$485/level)
        LP_SPREAD_BPS: '20',
        LP_REQUOTE_THRESHOLD: '30',
        LP_LEVEL_SPACING_BPS: '8',
        LP_ORDER_SIZE: '0.005',
        LP_MAX_ORDER_SIZE: '0.05',
        LP_MAX_ARB_QUANTITY: '0.01',
        LP_REFILL_THRESHOLD_BASE: '0.2',
        LP_REFILL_THRESHOLD_QUOTE: '20000',
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
        // Standard spread (~$540/level)
        LP_SPREAD_BPS: '30',
        LP_REQUOTE_THRESHOLD: '40',
        LP_LEVEL_SPACING_BPS: '12',
        LP_ORDER_SIZE: '0.2',
        LP_MAX_ORDER_SIZE: '2.0',
        LP_MAX_ARB_QUANTITY: '0.5',
        LP_REFILL_THRESHOLD_BASE: '8',
        LP_REFILL_THRESHOLD_QUOTE: '20000',
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
        // Wide spread for volatile asset (~$600/level)
        LP_SPREAD_BPS: '40',
        LP_REQUOTE_THRESHOLD: '50',
        LP_LEVEL_SPACING_BPS: '15',
        LP_ORDER_SIZE: '3',
        LP_MAX_ORDER_SIZE: '30',
        LP_MAX_ARB_QUANTITY: '10',
        LP_REFILL_THRESHOLD_BASE: '100',
        LP_REFILL_THRESHOLD_QUOTE: '20000',
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
