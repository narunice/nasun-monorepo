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
 *   TPSL_ALLOWED_ORIGIN=<origin-url>     # Required by tpsl-keeper (CORS, e.g. https://pado.finance)
 *   LOTTERY_ADMIN_KEY=<admin-key>        # Required by lottery-keeper (AdminCap owner)
 *   PREDICTION_RESOLVER_KEY=<key>        # Required by prediction-keeper (market.resolver)
 *   PREDICTION_KEEPER_MARKETS=<id,id>   # Comma-separated market ids to auto-resolve
 *   PREDICTION_LP_PRIVATE_KEY=<key>     # Required by prediction-lp (LP wallet)
 *   PREDICTION_LP_MARKETS=<id,id>       # Comma-separated market ids to quote
 *
 * The deploy script (scripts/deploy-pado-bots.sh) sources .env before PM2 start.
 * Non-secret config (contract addresses, RPC URLs) is set in env: blocks below.
 */

// Per-environment feature flags (set in .env, sourced before pm2 start)
const DISABLE_PRICE_UPDATER = process.env.DISABLE_PRICE_UPDATER === 'true';
const DISABLE_PREDICTION_KEEPER = process.env.DISABLE_PREDICTION_KEEPER === 'true';
const DISABLE_PREDICTION_LP = process.env.DISABLE_PREDICTION_LP === 'true';

// Prediction Market deployed package id (devnet). Override via .env if redeployed.
const PREDICTION_PACKAGE_ID =
  process.env.PREDICTION_PACKAGE_ID ||
  '0xbe6d8f699ebe9a4b7249f9853d73cdb9443fbccac8f7fcf7ade0c200769fa78d';

const COMMON_LP_ENV = {
  NODE_ENV: 'production',
  // Order depth (45 levels per side = 90 total orders)
  LP_ORDER_LEVELS: '45',
  LP_UPDATE_INTERVAL: '10000',   // 10 seconds
  // Risk controls
  LP_MIN_SPREAD_BPS: '10',
  LP_MAX_FAILURES: '5',
  // Gas: warn when below 1000 NASUN (each bot pre-funded with 100k NASUN via refill-gas.ts)
  LP_GAS_REFILL_THRESHOLD: '1000',
  // Disable per-cycle faucet calls to avoid shared object contention.
  // Watchdog handles token replenishment via batched faucet (5-min intervals).
  LP_DISABLE_TOKEN_FAUCET: 'true',
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
        WATCHDOG_INTERVAL_MS: '60000',    // 1 minute (5min caused up to 5min token drain gap)
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
    // Keeper Gas Watchdog (treasury-pattern auto-refill for ALL keeper wallets)
    // Source wallet (LP_PRIVATE_KEY_SOURCE) tops up each target to KEEPER_GAS_TARGET
    // when its balance falls below KEEPER_GAS_THRESHOLD. Configure via .env:
    //   KEEPER_GAS_TARGETS="crash:0x...,price-updater:0x...,tpsl:0x...,..."
    // ==============================
    {
      name: 'keeper-gas-watchdog',
      script: './node_modules/.bin/tsx',
      args: 'scripts/keeper-gas-watchdog.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
        KEEPER_GAS_INTERVAL_MS: '3600000',  // 1 hour
        KEEPER_GAS_THRESHOLD: '1000',       // refill below 1k NASUN
        KEEPER_GAS_TARGET: '100000',        // refill up to 100k NASUN
        KEEPER_GAS_SOURCE_WARN: '500000',   // warn when source < 500k NASUN
        // KEEPER_GAS_SOURCE_PRIVKEY (or LP_PRIVATE_KEY_SOURCE) and
        // KEEPER_GAS_TARGETS loaded from .env via deploy script
      },
      max_restarts: 10,
      restart_delay: 60000,  // 1min between restarts (not urgent)
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/keeper-gas-watchdog-error.log',
      out_file: './logs/keeper-gas-watchdog-out.log',
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
        // KEEPER_PRIVATE_KEY loaded from .env via deploy script
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
    // Prediction Market Keeper (auto-resolve binary markets)
    // Single instance only. Disable on staging via DISABLE_PREDICTION_KEEPER=true.
    // Resolver wallet must equal market.resolver on each market in
    // PREDICTION_KEEPER_MARKETS, otherwise the bot logs once and skips.
    // ==============================
    ...(DISABLE_PREDICTION_KEEPER ? [] : [{
      name: 'prediction-keeper',
      script: './node_modules/.bin/tsx',
      args: 'prediction-keeper.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        // PREDICTION_RESOLVER_KEY + PREDICTION_KEEPER_MARKETS loaded from .env
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
        PREDICTION_PACKAGE_ID,
        PREDICTION_KEEPER_INTERVAL_MS: '60000',
      },
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 10000,
      kill_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/prediction-keeper-error.log',
      out_file: './logs/prediction-keeper-out.log',
      merge_logs: true,
      max_memory_restart: '200M',
    }]),

    // ==============================
    // Prediction Market LP Bot (single-level YES quoter, mvp)
    // Single instance only. Disable on staging via DISABLE_PREDICTION_LP=true.
    // Inventory must be seeded once per market via
    //   node --env-file=.env --import tsx scripts/prediction-lp-bootstrap-mint.ts
    // before this bot can place sell-maker (yes-ask) quotes.
    // ==============================
    ...(DISABLE_PREDICTION_LP ? [] : [{
      name: 'prediction-lp',
      script: './node_modules/.bin/tsx',
      args: 'prediction-lp-bot.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        // PREDICTION_LP_PRIVATE_KEY + PREDICTION_LP_MARKETS loaded from .env
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
        PREDICTION_PACKAGE_ID,
        PREDICTION_LP_SPREAD_BPS: '200',
        PREDICTION_LP_DEPTH_NUSDC: '100',
        PREDICTION_LP_UPDATE_INTERVAL_MS: '10000',
      },
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 10000,
      kill_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/prediction-lp-error.log',
      out_file: './logs/prediction-lp-out.log',
      merge_logs: true,
      max_memory_restart: '300M',
    }]),

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
