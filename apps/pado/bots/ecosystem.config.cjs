/**
 * PM2 Ecosystem Configuration for Pado Bots
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs lp-bot-nbtc
 *   pm2 stop all
 *   pm2 restart all
 *
 * Before starting, export secrets via .env file:
 *   LP_PRIVATE_KEY=<your-hex-key>         # Required by LP bots
 *   ORACLE_ADMIN_KEY=<admin-hex-key>      # Required by price-updater
 *   KEEPER_PRIVATE_KEY=<keeper-hex-key>   # Required by tpsl-keeper
 *   TPSL_API_KEY=<api-key>               # Required by tpsl-keeper
 *   TPSL_ALLOWED_ORIGIN=<origin-url>     # Required by tpsl-keeper (CORS)
 *
 * The deploy script (scripts/deploy-pado-bots.sh) sources .env before PM2 start.
 * Non-secret config (contract addresses, RPC URLs) is set in env: blocks below.
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
        // Tight spread for main market (~$4,850/level)
        LP_SPREAD_BPS: '20',
        LP_REQUOTE_THRESHOLD: '30',
        LP_LEVEL_SPACING_BPS: '8',
        LP_ORDER_SIZE: '0.05',
        LP_MAX_ORDER_SIZE: '0.5',
        LP_MAX_ARB_QUANTITY: '0.1',
        LP_REFILL_THRESHOLD_BASE: '2',
        LP_REFILL_THRESHOLD_QUOTE: '200000',
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
        // Standard spread (~$5,400/level)
        LP_SPREAD_BPS: '30',
        LP_REQUOTE_THRESHOLD: '40',
        LP_LEVEL_SPACING_BPS: '12',
        LP_ORDER_SIZE: '2',
        LP_MAX_ORDER_SIZE: '20',
        LP_MAX_ARB_QUANTITY: '5',
        LP_REFILL_THRESHOLD_BASE: '80',
        LP_REFILL_THRESHOLD_QUOTE: '200000',
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
        // Wide spread for volatile asset (~$5,100/level)
        LP_SPREAD_BPS: '40',
        LP_REQUOTE_THRESHOLD: '50',
        LP_LEVEL_SPACING_BPS: '15',
        LP_ORDER_SIZE: '30',
        LP_MAX_ORDER_SIZE: '300',
        LP_MAX_ARB_QUANTITY: '100',
        LP_REFILL_THRESHOLD_BASE: '1000',
        LP_REFILL_THRESHOLD_QUOTE: '200000',
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
        // ORACLE_ADMIN_KEY loaded from .env via deploy script
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
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
        // KEEPER_PRIVATE_KEY and TPSL_API_KEY loaded from .env via deploy script
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
        ORACLE_REGISTRY_ID: '0xdd4b9ac16342bb2b4d8cd7ad3556f025122914a69450f72563e733d4a477e7f1',
        ORACLE_PACKAGE_ID: '0x8a0acb40e5546a01e276a367e583df32b134306ebce6118cc01d9e164edf4c1c',
        DEEPBOOK_PACKAGE: '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134',
        // TPSL_ALLOWED_ORIGIN loaded from .env (per-environment CORS origin)
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
