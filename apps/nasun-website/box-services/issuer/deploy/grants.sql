-- Box nasun_dal schema + grants for the nasun-issuer service.
-- Run as a superuser/owner: sudo -u postgres psql nasun_dal -f grants.sql
--
-- Unlike the sibling box services (whose tables came from the Phase 1 dal-load and are owned by nasun_app),
-- the `issuer` schema is issuer-private: created by postgres, read/written by nobody else. It is OUTSIDE the
-- dal-reload scope (dal-reload rebuilds only user_profiles + wallet_owner), so these ACLs are STABLE and
-- there is no re-grant gap.
--
-- Every statement below is IDEMPOTENT and matches the live box as measured 2026-08-26. This file is the
-- authoritative record for a REBUILD, not a migration to apply to the running box.
--
-- ============================================================================
-- ★ APPEND-ONLY INVARIANT. nasun_issuer holds SELECT + INSERT and NOTHING ELSE (no UPDATE, no DELETE).
-- server.mjs depends on this at two points:
--   - resolveIdentityId(): "Never re-points an existing identifier (issuer role has no UPDATE)."
--   - resolveSalt():       "The salt+address pair is immutable once stored (issuer role has no UPDATE)."
-- A zkLogin address is derived from (salt, sub); mutating a stored salt would silently move a live user's
-- wallet to a different address and strand their assets. Both functions use ON CONFLICT DO NOTHING (which
-- needs only INSERT, not UPDATE) so a concurrent first-login race converges instead of overwriting.
-- DO NOT grant UPDATE or DELETE to nasun_issuer. The privilege ceiling IS the safety mechanism.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS issuer AUTHORIZATION postgres;

-- Cognito GetOpenIdTokenForDeveloperIdentity replacement: the append-only credential -> identityId map that
-- POST /mint reads (and extends on a first-seen credential).
CREATE TABLE IF NOT EXISTS issuer.identity_map (
  developer_user_identifier text PRIMARY KEY,
  identity_id               text NOT NULL,
  provider                  text,
  cred_type                 text,
  source                    text
);
CREATE INDEX IF NOT EXISTS idx_im_identity ON issuer.identity_map (identity_id);

-- Hosted zkLogin salt store (replaces the zklogin-salt lambda's DynamoDB table). Keyed (provider, sub);
-- the (salt, address) pair is immutable once written, per the invariant above.
CREATE TABLE IF NOT EXISTS issuer.zklogin_users (
  provider   text NOT NULL,
  sub        text NOT NULL,
  address    text NOT NULL,
  salt       text NOT NULL,
  created_at timestamptz DEFAULT now(),
  attributes jsonb,
  PRIMARY KEY (provider, sub)
);
CREATE INDEX IF NOT EXISTS idx_zk_address ON issuer.zklogin_users (address);

-- ============================================================================
-- Service role. Created once at provisioning with a generated password (openssl rand -hex 24); the same
-- value goes into the host-bound systemd credential pg-password.cred. The password is NOT committed and
-- cannot be recovered from the .cred (it is encrypted to the box host key), so a rebuild generates a new
-- one and re-encrypts the credential.
--
-- REBUILD-ONLY (commented so this file stays a no-op against the live box, where the role already exists
-- and reaches the database through the PUBLIC default CONNECT that nasun_dal still carries; the explicit
-- grant is only required on a cluster where PUBLIC CONNECT has been revoked):
--   CREATE ROLE nasun_issuer LOGIN PASSWORD '<generated>';
--   GRANT CONNECT ON DATABASE nasun_dal TO nasun_issuer;

GRANT USAGE ON SCHEMA issuer TO nasun_issuer;
GRANT SELECT, INSERT ON issuer.identity_map, issuer.zklogin_users TO nasun_issuer;

-- Guard against a future ALTER DEFAULT PRIVILEGES or a careless GRANT ALL widening the role. A no-op on the
-- live box (the role never held these), but note that REVOKE takes a brief ACCESS EXCLUSIVE lock on both
-- tables, which stalls /mint and /zklogin/salt while it is held. One more reason this file is a rebuild
-- record rather than something to run against a serving issuer.
REVOKE UPDATE, DELETE, TRUNCATE ON issuer.identity_map, issuer.zklogin_users FROM nasun_issuer;
