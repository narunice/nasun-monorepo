-- Banned users registry (single source of truth for bot/abuse bans).
--
-- Applied manually:
--   psql "$POINTS_DATABASE_URL" -f banned-users-schema.sql
--
-- Semantics:
--   - identity_id is the Cognito Identity Pool id (region:uuid).
--   - wallet_address is the Sui wallet (lowercased 0x + 64 hex). Optional —
--     a banned user may not have linked a wallet yet, but the column is
--     denormalized here so chat-server can build an exclusion set without
--     re-resolving every cycle.
--   - x_handle is the Twitter handle that originally identified the user as
--     a bot (lowercased, no @ prefix). Audit-only; not used for matching.
--   - unbanned_at IS NULL ⇒ ban active. UNBAN sets unbanned_at = NOW() but
--     never deletes the row, so audit history is preserved.

CREATE TABLE IF NOT EXISTS banned_users (
  identity_id    TEXT PRIMARY KEY,
  wallet_address TEXT,
  x_handle       TEXT,
  reason         TEXT NOT NULL,
  banned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  banned_by      TEXT NOT NULL,
  unbanned_at    TIMESTAMPTZ,
  unbanned_by    TEXT,
  notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_banned_users_active_wallet
  ON banned_users (wallet_address)
  WHERE unbanned_at IS NULL AND wallet_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_banned_users_active
  ON banned_users (identity_id)
  WHERE unbanned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_banned_users_x_handle
  ON banned_users (x_handle)
  WHERE unbanned_at IS NULL AND x_handle IS NOT NULL;

-- BEFORE INSERT trigger on activity_points: auto-flag rows whose identity_id
-- (or wallet_address) belongs to an active ban. Silent-ban semantics -- INSERT
-- succeeds (preserving audit trail) but flagged=true so the row is excluded
-- from every leaderboard/settlement query (`WHERE NOT flagged`).
--
-- Covers all insert paths uniformly: indexer, /creator-post-reward,
-- /bug-report-reward, manual psql, and any future endpoint. No per-route
-- gating to forget.
--
-- BEFORE INSERT only (not UPDATE): all callers use INSERT ... ON CONFLICT DO
-- NOTHING for idempotency. The table has no UPDATE paths in the codebase, so
-- a BEFORE UPDATE trigger would be dead code and misleading.
--
-- Lookup cost: one indexed point lookup per INSERT (idx_banned_users_active +
-- idx_banned_users_active_wallet, both partial WHERE unbanned_at IS NULL).
--
-- Atomicity: wrapped in a transaction so the DROP TRIGGER -> CREATE TRIGGER
-- window is never visible to concurrent INSERTs under load.

BEGIN;

CREATE OR REPLACE FUNCTION _activity_points_autoflag_banned()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.flagged THEN
    RETURN NEW;
  END IF;
  IF NEW.identity_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM banned_users
    WHERE identity_id = NEW.identity_id AND unbanned_at IS NULL
  ) THEN
    NEW.flagged := TRUE;
    NEW.flag_reason := COALESCE(NEW.flag_reason, 'banned-user');
    RETURN NEW;
  END IF;
  IF NEW.wallet_address IS NOT NULL AND EXISTS (
    SELECT 1 FROM banned_users
    WHERE wallet_address = NEW.wallet_address AND unbanned_at IS NULL
  ) THEN
    NEW.flagged := TRUE;
    NEW.flag_reason := COALESCE(NEW.flag_reason, 'banned-user');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS _ap_autoflag_banned ON activity_points;
CREATE TRIGGER _ap_autoflag_banned
  BEFORE INSERT ON activity_points
  FOR EACH ROW
  EXECUTE FUNCTION _activity_points_autoflag_banned();

COMMIT;
