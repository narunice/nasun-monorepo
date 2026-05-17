-- Gostop backend — migration 002: leaderboard window-scan index
--
-- Apply order:
--   1. As gostop_writer (or owner of gostop.game_round): run section 1.
--
-- CONCURRENTLY runs OUTSIDE a transaction. If your migration runner wraps
-- statements in BEGIN/COMMIT, copy the CREATE INDEX line into a separate
-- session (psql autocommit) before running anything else here. This file is
-- safe to re-run: IF NOT EXISTS skips when the index is already valid.
--
-- Cleanup on failure (CONCURRENTLY leaves a marked-invalid index on error):
--   psql ... -c "DROP INDEX CONCURRENTLY IF EXISTS gostop.idx_gr_final_ts_player;"
--   then re-run this file.
--
-- Why this index:
--   queryLeaderboard (period in 24h/7d/30d) range-scans
--     WHERE status = 'final' AND timestamp_ms BETWEEN $1 AND $2
--   then GROUP BY player. The existing idx_gr_player_ts is player-prefixed
--   (good for /me, /streak lookups) but the leaderboard window aggregate
--   reads every player, so a window-prefixed partial index lets the planner
--   stream rows in timestamp order without scanning player history.
--   The WHERE status='final' clause makes this a partial index (final rows
--   only; pending/expired rounds are ignored by the leaderboard query).

-- =============================================================================
-- 1. Index
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gr_final_ts_player
  ON gostop.game_round (timestamp_ms DESC, player)
  WHERE status = 'final';

COMMENT ON INDEX gostop.idx_gr_final_ts_player IS
  'Partial index for leaderboard window queries (24h/7d/30d). Paired with idx_gr_player_ts (player-prefix) which serves /me and /streak.';
