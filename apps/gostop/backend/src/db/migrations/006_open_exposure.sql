-- =============================================================================
-- 006_open_exposure.sql — Tier 1 post-cleanup §10.B Liability-aware NAV
-- =============================================================================
-- Adds `open_exposure_after` to gostop.bankroll_event.
--
-- v0.0.4 introduces an additional event `OpenExposureSnapshot` emitted by
-- bankroll_pool on every collect_bet / pay_winner / refund_bet. The indexer
-- writes one row per snapshot event with event_type='open_exposure_snapshot'
-- and open_exposure_after = chain reading at that tx. risk-metrics reads the
-- latest snapshot row for live max-liability exposure.
--
-- Why a separate row (not co-attaching to BetRefunded etc):
-- collect_bet and pay_winner do NOT stream into bankroll_event (existing
-- design: those flow through game_round per lp-gap-analysis §5.1). Their
-- co-emitted OpenExposureSnapshot would have no parent row to attach to. A
-- per-event snapshot row sidesteps the issue and is consistent with how
-- shares_seeded / cap_updated already live in bankroll_event as their own
-- rows.
--
-- event_type validation: schema uses plain TEXT (single-writer indexer
-- enforces the allowed set, see migrations/004 §1). 'open_exposure_snapshot'
-- joins the existing enum on the indexer side; no schema change needed for
-- the value itself.
-- =============================================================================

ALTER TABLE gostop.bankroll_event
  ADD COLUMN IF NOT EXISTS open_exposure_after NUMERIC(30,0) NULL;

COMMENT ON COLUMN gostop.bankroll_event.open_exposure_after IS
  'v0.0.4 OpenExposureSnapshot.open_exposure_after. NULL on pre-v0.0.4 rows and on non-snapshot events. NUMERIC(30,0) so it can hold the same u64 range as amount.';

-- Reconciler scan: find OpenExposureSnapshot rows still missing the snapshot.
-- Partial index keeps it tiny — the reconciler clears these quickly after the
-- relevant watermark advances.
CREATE INDEX IF NOT EXISTS idx_bre_unsnapshotted_exposure
  ON gostop.bankroll_event (timestamp_ms, id)
  WHERE event_type = 'open_exposure_snapshot' AND open_exposure_after IS NULL;
