-- Ecosystem Score Daily Snapshots
-- Run against the nasun_points database (POINTS_DATABASE_URL)
-- Immutable: rows must never be UPDATEd or DELETEd. Token allocation basis.

CREATE TABLE IF NOT EXISTS ecosystem_score_snapshots (
  identity_id     TEXT NOT NULL,
  snapshot_date   DATE NOT NULL,
  base_score      INT NOT NULL DEFAULT 0,
  multiplier      NUMERIC(5,2) NOT NULL DEFAULT 0,
  bonus_total     NUMERIC(10,2) NOT NULL DEFAULT 0,
  referral_bonus  NUMERIC(10,2) NOT NULL DEFAULT 0,
  governance_bonus NUMERIC(10,2) NOT NULL DEFAULT 0,
  ecosystem_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_penalized    BOOLEAN NOT NULL DEFAULT FALSE,
  rank            INT,
  is_backfilled   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identity_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_date_rank
  ON ecosystem_score_snapshots(snapshot_date, rank);

CREATE INDEX IF NOT EXISTS idx_snapshot_identity_date
  ON ecosystem_score_snapshots(identity_id, snapshot_date DESC);

COMMENT ON TABLE ecosystem_score_snapshots IS
  'Immutable daily snapshots. Rows must never be UPDATEd or DELETEd. Token allocation basis.';

-- V2 columns (additive only — historical rows keep NULLs).
-- Pre-cutover rows: multiplier/ecosystem_score filled, _v2 columns NULL.
-- Post-cutover rows: multiplier_v2/ecosystem_score_v2 filled, legacy columns NULL.
-- Downstream: COALESCE(multiplier_v2, multiplier) for cross-era compatibility.
ALTER TABLE ecosystem_score_snapshots
  ADD COLUMN IF NOT EXISTS alliance_health     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS gp_health           NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS multiplier_v2       NUMERIC(7,3),
  ADD COLUMN IF NOT EXISTS ecosystem_score_v2  NUMERIC(14,3);
