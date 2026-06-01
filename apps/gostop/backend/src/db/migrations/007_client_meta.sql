-- =============================================================================
-- 007_client_meta.sql — bot-traffic hygiene: per-wallet client fingerprint
-- =============================================================================
-- Captures the reporting client's screen resolution (+ user agent) per wallet,
-- written by POST /api/gostop/me/client-meta on session start. Purpose: make
-- the "impossible screen resolution" bot signal wallet-attributable.
--
-- Background: Umami analytics shows a residual bot cluster whose browsers
-- report physically impossible screen resolutions (e.g. 16696x9392,
-- 22934x9600) — values no real consumer display produces (8K = 7680 wide).
-- Umami has no wallet identifier, so that signal cannot be tied to a player.
-- This table closes that gap from the app's own authenticated calls.
--
-- is_impossible: width >= 8192 OR height >= 4321. Observed real devices top out
-- ~5333 wide; observed bots start at 9600 wide. The ~4000px buffer makes this a
-- zero-false-positive flag. is_impossible is STICKY (OR-accumulated on upsert):
-- once a wallet ever reports an impossible resolution it stays flagged.
--
-- Use: leaderboard / metrics exclusion only (withhold from rankings & counts).
-- This is NOT a gameplay block and NOT an auto-ban — gameplay and ecosystem
-- points are never affected. Adjudicated bans remain in public.banned_users
-- (manual review). A misclassified real user (effectively impossible given the
-- buffer) would at worst drop off the leaderboard, never lose access.
-- =============================================================================

CREATE TABLE IF NOT EXISTS gostop.client_meta (
  player         TEXT PRIMARY KEY,
  screen         TEXT,
  screen_w       INT,
  screen_h       INT,
  is_impossible  BOOLEAN NOT NULL DEFAULT false,
  user_agent     TEXT,
  hit_count      BIGINT NOT NULL DEFAULT 1,
  first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial index: the leaderboard exclusion only probes flagged players, so keep
-- the index tiny (impossible rows only).
CREATE INDEX IF NOT EXISTS idx_client_meta_impossible
  ON gostop.client_meta (player)
  WHERE is_impossible;

COMMENT ON TABLE gostop.client_meta IS
  'Per-wallet client fingerprint (screen resolution) from POST /me/client-meta. is_impossible (width>=8192||height>=4321) flags fabricated-resolution bots for leaderboard/metrics exclusion only. Never blocks gameplay or points.';

-- Keep gostop.* objects owned by gostop_writer (ownership invariant: the API
-- writer must own its tables). Idempotent: no-op when already owner. Safe when
-- the migration is applied as a superuser or as gostop_writer itself.
ALTER TABLE gostop.client_meta OWNER TO gostop_writer;

GRANT ALL ON gostop.client_meta TO gostop_writer;
GRANT SELECT ON gostop.client_meta TO gostop_reader;
