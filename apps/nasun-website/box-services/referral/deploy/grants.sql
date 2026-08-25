-- Box nasun_dal grants + indexes for the nasun-referral service.
-- Run as a superuser/owner: sudo -u postgres psql nasun_dal -f grants.sql
--
-- referrals / referral_codes were created by the Phase 1 dal-load owned by nasun_app, and ALREADY carry the
-- standard grants (verified 2026-06-21 \dp): nasun_identity=arwd (RW), nasun_compute_ro/chat_ro/keeper=SELECT.
-- The PK + referrer/code indexes also exist. So these statements are IDEMPOTENT / no-ops on the current box;
-- kept here as the authoritative record for a rebuild. UNLIKE the leaderboard lb_* tables, referrals/codes
-- are OUTSIDE the dal-reload scope (it rebuilds only user_profiles + wallet_owner), so their ACLs are stable.

-- Read role (nasun-referral read pool + the admin-role check on user_profiles).
GRANT SELECT ON referrals, referral_codes TO nasun_compute_ro;

-- Write role (nasun-referral write pool: apply / my-code reserve / appeal / admin approve-decline-resolve).
GRANT SELECT, INSERT, UPDATE, DELETE ON referrals, referral_codes TO nasun_identity;

-- Indexes (Phase 1 created the PK + referrer/code btrees; restated for a rebuild).
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_identity_id);
CREATE INDEX IF NOT EXISTS referrals_code_idx ON referrals (referral_code);
CREATE INDEX IF NOT EXISTS referral_codes_identity_idx ON referral_codes (identity_id);
-- status scans (admin review list + internal referral-mappings). Bounded table; index keeps the by-status
-- scan from a full seq-scan as the table grows.
CREATE INDEX IF NOT EXISTS referrals_status_idx ON referrals (status);

-- ============================================================================
-- compute_ro user_profiles SELECT for the admin-role check. user_profiles IS in the dal-reload scope, which
-- DROPs+recreates it and re-grants SELECT only to nasun_chat_ro, nasun_keeper (NOT compute_ro) at line 298.
-- The leaderboard box admin already reads user_profiles as compute_ro and is LIVE, so this grant exists now
-- but is dropped on the next dal-reload. FIX (Phase 3b prerequisite): add nasun_compute_ro to the dal-reload
-- re-grant so it survives. Restated here for completeness:
GRANT SELECT ON user_profiles TO nasun_compute_ro;
