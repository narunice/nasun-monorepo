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
 *   LP_PRIVATE_KEY=<your-hex-key>         # Shared fallback for LP bots
 *   LP_PRIVATE_KEY_NBTC=<key>             # Per-bot keys (recommended, avoids gas coin contention)
 *   LP_PRIVATE_KEY_NETH=<key>
 *   LP_PRIVATE_KEY_NSOL=<key>
 *   ORACLE_ADMIN_KEY=<admin-hex-key>      # Required by price-updater
 *   KEEPER_PRIVATE_KEY=<keeper-hex-key>   # Required by tpsl-keeper
 *   TPSL_API_KEY=<api-key>               # Required by tpsl-keeper
 *   TPSL_ALLOWED_ORIGIN=<origin-url>     # Required by tpsl-keeper (CORS)
 *   LOTTERY_ADMIN_KEY=<admin-key>        # Required by lottery-keeper (AdminCap owner)
 *
 * The deploy script (scripts/deploy-pado-bots.sh) sources .env before PM2 start.
 * Non-secret config (contract addresses, RPC URLs) is set in env: blocks below.
 */

// Per-environment feature flags (set in .env, sourced before pm2 start)
const DISABLE_PRICE_UPDATER = process.env.DISABLE_PRICE_UPDATER === 'true';

const COMMON_LP_ENV = {
  NODE_ENV: 'production',
  // Order depth (45 levels per side = 90 total orders)
  LP_ORDER_LEVELS: '45',
  LP_UPDATE_INTERVAL: '10000',   // 10 seconds
  // Risk controls
  LP_MIN_SPREAD_BPS: '10',
  LP_MAX_FAILURES: '5',
  // Gas management
  LP_GAS_REFILL_THRESHOLD: '0.4',
};

const COMMON_LP_OPTS = {
  script: './node_modules/.bin/tsx',
  args: 'lp-bot.ts',
  cwd: __dirname,
  interpreter: 'none',
  max_restarts: 10,
  restart_delay: 5000,
  exp_backoff_restart_delay: 100,
  kill_timeout: 4000, // 4s for best-effort order cancel (3s timeout + 1s buffer)
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
        LP_PRIVATE_KEY: process.env.LP_PRIVATE_KEY_NBTC || process.env.LP_PRIVATE_KEY,
        LP_MARKET: 'NBTC',
        // Tight spread for main market
        LP_SPREAD_BPS: '20',
        LP_REQUOTE_THRESHOLD: '20',
        LP_LEVEL_SPACING_BPS: '6',
        LP_ORDER_SIZE: '0.1',
        LP_MAX_ORDER_SIZE: '0.5',
        LP_MAX_ARB_QUANTITY: '10',
        LP_DIVERGENCE_THRESHOLD_BPS: '30',   // 1.5x spread(20bps); must be > LP_REQUOTE_THRESHOLD(20)
        LP_REFILL_THRESHOLD_BASE: '6',
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
        LP_PRIVATE_KEY: process.env.LP_PRIVATE_KEY_NETH || process.env.LP_PRIVATE_KEY,
        LP_MARKET: 'NETH',
        // Standard spread
        LP_SPREAD_BPS: '30',
        LP_REQUOTE_THRESHOLD: '25',
        LP_LEVEL_SPACING_BPS: '8',
        LP_ORDER_SIZE: '4',
        LP_MAX_ORDER_SIZE: '20',
        LP_MAX_ARB_QUANTITY: '5',
        LP_DIVERGENCE_THRESHOLD_BPS: '45',   // 1.5x spread(30bps); must be > LP_REQUOTE_THRESHOLD(25)
        LP_REFILL_THRESHOLD_BASE: '250',
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
        LP_PRIVATE_KEY: process.env.LP_PRIVATE_KEY_NSOL || process.env.LP_PRIVATE_KEY,
        LP_MARKET: 'NSOL',
        // Wide spread for volatile asset
        LP_SPREAD_BPS: '40',
        LP_REQUOTE_THRESHOLD: '30',
        LP_LEVEL_SPACING_BPS: '10',
        LP_ORDER_SIZE: '50',
        LP_MAX_ORDER_SIZE: '300',
        LP_MAX_ARB_QUANTITY: '100',
        LP_DIVERGENCE_THRESHOLD_BPS: '60',   // 1.5x spread(40bps); must be > LP_REQUOTE_THRESHOLD(30)
        LP_REFILL_THRESHOLD_BASE: '3500',
        LP_REFILL_THRESHOLD_QUOTE: '200000',
        LP_MIN_PRICE: '10',
        LP_MAX_PRICE: '1000',
      },
      error_file: './logs/lp-bot-nsol-error.log',
      out_file: './logs/lp-bot-nsol-out.log',
    },

    // ==============================
    // Price Updater (single instance, all symbols)
    // Disabled on staging via DISABLE_PRICE_UPDATER=true (staging reads prod oracle)
    // ==============================
    ...(DISABLE_PRICE_UPDATER ? [] : [{
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
    }]),

    // ==============================
    // Balance Watchdog (auto-refills bot wallets via batched legacy faucet)
    // ==============================
    {
      name: 'balance-watchdog',
      script: './node_modules/.bin/tsx',
      args: 'scripts/balance-watchdog.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
        WATCHDOG_INTERVAL_MS: '600000',   // 10 minutes
        WATCHDOG_REFILL_ROUNDS: '100',    // 100 rounds per refill TX
      },
      max_restarts: 10,
      restart_delay: 30000,  // 30s between restarts (not urgent)
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/balance-watchdog-error.log',
      out_file: './logs/balance-watchdog-out.log',
      merge_logs: true,
      max_memory_restart: '200M',
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
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/tpsl-keeper-error.log',
      out_file: './logs/tpsl-keeper-out.log',
      merge_logs: true,
      max_memory_restart: '300M',
    },

    // ==============================
    // Lottery Keeper Bot (weekly cycle automation)
    // ==============================
    {
      name: 'lottery-keeper',
      script: './node_modules/.bin/tsx',
      args: 'lottery-keeper.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        // LOTTERY_ADMIN_KEY loaded from .env via deploy script
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
      },
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 10000,  // 10s between restarts (not latency-sensitive)
      kill_timeout: 15000,   // 15s for in-progress settlement to complete
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/lottery-keeper-error.log',
      out_file: './logs/lottery-keeper-out.log',
      merge_logs: true,
      max_memory_restart: '200M',
    },
  ],
};
