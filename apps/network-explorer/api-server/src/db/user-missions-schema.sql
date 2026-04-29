-- user_active_missions: persists each user's curated daily mission selection.
-- missions: flat JSON string array of category ids (e.g. ["faucet","pado-dex"]).
-- Used by the daily snapshot job and the /score endpoint to compute a
-- filtered base_score that reflects only the user's activated missions.
-- updated_at: wall-clock timestamp of the last PUT from any device. Multi-
-- device sync uses this value to determine which side (client or server) is
-- newer and should win.

CREATE TABLE IF NOT EXISTS user_active_missions (
  identity_id  TEXT        PRIMARY KEY,
  missions     JSONB       NOT NULL DEFAULT '[]',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
