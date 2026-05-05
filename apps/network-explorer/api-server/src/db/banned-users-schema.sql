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
