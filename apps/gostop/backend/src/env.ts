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
    // Fall back to the JWT secret to avoid an extra deploy footgun, but a
    // dedicated value is preferred so rotating one doesn't unmask the other.
    anonSalt: opt('FEED_ANON_SALT', '') || opt('AUTH_JWT_SECRET', 'fallback-anon-salt'),
    // Channel name for Postgres LISTEN/NOTIFY fan-out. Indexer NOTIFYs here
    // after committing INSERTs; API process LISTENs and broadcasts via hub.
    channel: opt('FEED_PG_CHANNEL', 'gostop_feed'),
    // Ring buffer size per topic for replay-on-connect.
    ringSize: num('FEED_RING_SIZE', 20),
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
} as const;
