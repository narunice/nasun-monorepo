/**
 * Env loader. Fails fast at boot when required vars are missing.
 * See .env.example for the full surface.
 */

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`[gostop-backend] missing required env: ${name}`);
  }
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] && process.env[name]!.length > 0
    ? process.env[name]!
    : fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`[gostop-backend] env ${name} is not a number: ${raw}`);
  }
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

// Two ways to enable production-grade salt enforcement, so a missing
// NODE_ENV in pm2/ecosystem.cjs can't silently fail-open. Either signal
// (or both) is treated as "this is prod".
const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' ||
  process.env.GOSTOP_REQUIRE_PROD_SALT === '1';
const ANON_SALT_FALLBACK = 'fallback-anon-salt';
const ANON_SALT_MIN_LENGTH = 32;

/**
 * Resolves FEED_ANON_SALT with a JWT-secret fallback in dev/test, but in
 * production refuses to start if the salt is missing, too short, or equals
 * the literal fallback. The salt feeds visibility-mask's anonId() — a weak
 * or default value would let anyone recompute every anonymous player's
 * pseudonym back to the raw address. It must also never rotate once any
 * anon_id has been published (anon-id grouping contract).
 */
function resolveAnonSalt(): string {
  const explicit = process.env.FEED_ANON_SALT ?? '';
  if (explicit.length > 0) {
    if (IS_PRODUCTION && explicit === ANON_SALT_FALLBACK) {
      throw new Error('[gostop-backend] FEED_ANON_SALT must not equal the dev fallback literal in production');
    }
    if (IS_PRODUCTION && explicit.length < ANON_SALT_MIN_LENGTH) {
      throw new Error(`[gostop-backend] FEED_ANON_SALT must be >= ${ANON_SALT_MIN_LENGTH} chars in production (got ${explicit.length})`);
    }
    return explicit;
  }
  if (IS_PRODUCTION) {
    throw new Error('[gostop-backend] FEED_ANON_SALT is required in production (no fallback)');
  }
  const jwt = process.env.AUTH_JWT_SECRET ?? '';
  return jwt.length > 0 ? jwt : ANON_SALT_FALLBACK;
}

export const env = {
  role: opt('ROLE', 'api'),

  db: {
    writeUrl: req('GOSTOP_DATABASE_URL'),
    readUrl: opt('GOSTOP_READ_URL', process.env.GOSTOP_DATABASE_URL ?? ''),
    poolMax: num('GOSTOP_DB_POOL_MAX', 10),
  },

  rpc: {
    url: req('SUI_RPC_URL'),
    concurrency: num('RPC_CONCURRENCY', 10),
    retryMax: num('RPC_RETRY_MAX', 3),
  },

  api: {
    port: num('API_PORT', 3201),
    corsOrigin: opt('API_CORS_ORIGIN', '').split(',').map(s => s.trim()).filter(Boolean),
  },

  auth: {
    jwtSecret: opt('AUTH_JWT_SECRET', ''),
    ttlSeconds: num('AUTH_JWT_TTL_SECONDS', 3600),
    bindIp: bool('AUTH_BIND_IP', true),
  },

  feed: {
    whaleBetThresholdRaw: BigInt(opt('WHALE_BET_THRESHOLD_RAW', '100000000')),
    whalePayoutThresholdRaw: BigInt(opt('WHALE_PAYOUT_THRESHOLD_RAW', '500000000')),
    streakMin: num('STREAK_FEED_MIN', 5),
    // Salt for anon_id derivation in visibility-mask. Must be stable across
    // restarts so an opted-in-then-anonymous wallet keeps the same anon_id.
    // Production requires a dedicated FEED_ANON_SALT >= 32 chars; dev/test
    // falls back to AUTH_JWT_SECRET or a known literal. See resolveAnonSalt().
    anonSalt: resolveAnonSalt(),
    // Channel name for Postgres LISTEN/NOTIFY fan-out. Indexer NOTIFYs here
    // after committing INSERTs; API process LISTENs and broadcasts via hub.
    channel: opt('FEED_PG_CHANNEL', 'gostop_feed'),
    // Ring buffer size per topic for replay-on-connect. 500 rows × ~250 bytes
    // = ~125 KB per topic, negligible. Sized to comfortably cover a 30 min
    // window even during a burst.
    ringSize: num('FEED_RING_SIZE', 500),
    // Single source of truth for live-feed window. Used by:
    //   - indexer notify-feed (suppress historical NOTIFY)
    //   - hub.replay() cutoff
    //   - boot-time hydrate query
    //   - frontend empty-state copy
    liveWindowMs: num('FEED_LIVE_WINDOW_MS', 30 * 60 * 1000),
    // Disable WS feed entirely (kill-switch for incident response).
    enabled: bool('FEED_ENABLED', true),
  },

  alerts: {
    telegramBotToken: opt('TELEGRAM_BOT_TOKEN', ''),
    telegramChatId: opt('TELEGRAM_ALERT_CHAT_ID', ''),
  },

  matview: {
    intervalMin: num('MATVIEW_REFRESH_INTERVAL_MIN', 10),
    offPeakStartHour: num('MATVIEW_REFRESH_OFF_PEAK_START_HOUR', 3),
    offPeakEndHour: num('MATVIEW_REFRESH_OFF_PEAK_END_HOUR', 4),
  },

  // Optional: explorer-api base URL for live ecosystem scores + Nasun profiles.
  // When unset, /me/profile falls back to the daily ecosystem_score_snapshots table.
  explorerApiUrl: opt('EXPLORER_API_URL', '').replace(/\/+$/, ''),
  // Shared secret for the self-only ecosystem endpoints (issue #1). gostop-
  // backend is a trusted server-to-server caller; the API key short-circuits
  // the user-JWT identity match so /me/profile can still resolve the player's
  // live ecosystem score by identityId without forwarding the player's
  // Cognito token. Must match ECOSYSTEM_INTERNAL_API_KEY on explorer-api.
  ecosystemInternalApiKey: opt('ECOSYSTEM_INTERNAL_API_KEY', ''),
} as const;
