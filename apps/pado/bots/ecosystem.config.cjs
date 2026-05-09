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
  // Tiered grid is configured in lib/config.ts (DEFAULT_ZONES: 10@3 / 15@8 / 15@22).
  // LP_ORDER_LEVELS is only consulted by the legacy uniform path; total tiered
  // levels per side is sum of zone.levels (40), well within the 50 cap.
  LP_ORDER_LEVELS: '40',
  LP_UPDATE_INTERVAL: '4000',   // 4s post-cycle gap (setTimeout chain self-paces if cycle > 4s)
  // Allow innermost 3 bps band to pass validateOrders (DEFAULT_ZONES inner spacing = 3).
  LP_MIN_SPREAD_BPS: '2',
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
        // Spread/spacing/requote/divergence: tiered grid defaults from lib/config.ts
        // (DEFAULT_ZONES + market.defaultSpreadBps=3, defaultRequoteThresholdBps=5).
        LP_ORDER_SIZE: '0.1',
        LP_MAX_ORDER_SIZE: '0.5',
        LP_MAX_ARB_QUANTITY: '10',
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
        // Spread/spacing/requote/divergence: tiered grid defaults from lib/config.ts.
        LP_ORDER_SIZE: '4',
        LP_MAX_ORDER_SIZE: '20',
        LP_MAX_ARB_QUANTITY: '5',
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
        // Spread/spacing/requote/divergence: tiered grid defaults from lib/config.ts.
        LP_ORDER_SIZE: '50',
        LP_MAX_ORDER_SIZE: '300',
        LP_MAX_ARB_QUANTITY: '100',
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
        // Tightened ladder for richer top-of-book and gentler small-trade impact.
        // Top quote sits 100 bps from mid (was 200); 8 levels per side (was 5);
        // gaps shrink to 30 bps with milder geometric growth so the middle
        // levels are denser and outer levels stay reachable.
        PREDICTION_LP_BASE_SPREAD_BPS: '100',
        PREDICTION_LP_LADDER_LEVELS: '8',
        PREDICTION_LP_LEVEL_GAP_BPS: '30',
        PREDICTION_LP_GAP_GROWTH: '1.3',
        // Depth: innermost 75 NUSDC (was 25) + softer pyramid so users hitting
        // small sizes (≤100 NUSDC) sweep entirely within the inner two levels.
        PREDICTION_LP_BASE_SIZE_NUSDC: '75',
        PREDICTION_LP_SIZE_GROWTH: '1.4',
        PREDICTION_LP_UPDATE_INTERVAL_MS: '10000',
        // Inventory skew: ladder mid still shifts with taker-driven imbalance so
        // the YES/NO bar moves on real volume — but the cap is 3× larger so a
        // tiny imbalance no longer produces a visible mid jump. Max shift
        // (alpha) stays at 5% for genuinely lopsided depth.
        PREDICTION_LP_INV_SKEW_ALPHA_BPS: '500',
        PREDICTION_LP_INV_CAP_SHARES: '1500',
        // Repost on ≥0.5% mid shift (was 1%) so quotes track volume more closely
        // without spamming the network on sub-bps drift.
        PREDICTION_LP_MIN_REPOST_BPS: '50',
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
    // Prediction Arbitrage Bot
    // Captures mint-arbitrage when (yes_bid + no_bid) > 10000 bps.
    // Requires a funded NUSDC wallet (separate from prediction-lp to avoid coin conflicts).
    // ==============================
    {
      name: 'prediction-arb',
      script: './node_modules/.bin/tsx',
      args: 'prediction-arb-bot.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        // PREDICTION_ARB_PRIVATE_KEY loaded from .env
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
        PREDICTION_PACKAGE_ID,
        PREDICTION_ARB_INTERVAL_MS: '15000',
        PREDICTION_ARB_MAX_NUSDC: '10',
        PREDICTION_ARB_MIN_PROFIT_BPS: '100',
        PREDICTION_ARB_MIN_GAS_NASUN: '50',
        PREDICTION_ARB_MIN_NUSDC: '50',
        PREDICTION_ARB_NUSDC_REFILL_ROUNDS: '50',
      },
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 10000,
      kill_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/prediction-arb-error.log',
      out_file: './logs/prediction-arb-out.log',
      merge_logs: true,
      max_memory_restart: '200M',
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
