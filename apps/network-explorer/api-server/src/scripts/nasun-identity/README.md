# nasun-identity (AWS-exit DAL S1)

Box-co-located write service that de-Lambdas the **wallet + profile** identity slice.
Deployed to the Hetzner box at `/srv/nasun/identity/`, alongside the issuer. Mirrors the
issuer's `server.mjs` shape (`node:http` + `postgres` + constant-time bearer) but writes
rows instead of minting JWTs.

## Role in the migration

S1 runs this as a **follower**: the still-on-AWS login/wallet lambdas keep writing
DynamoDB as the source of truth and *additionally* POST to these routes so the box PG
mirror carries the same write. `dal-reload` (full re-scan every 10 min) + `dal-reconcile`
remain the backstop, so a missed/skewed box write self-heals on the next reload. The box
is **not** authoritative in S1 (no serving flip, no DynamoDB-write removal -- those are
S2/S3).

## Routes

| Method | Path | Body | Mirrors |
|---|---|---|---|
| GET | `/health` | -- | liveness |
| POST | `/profile/upsert` | `{ identityId, walletAddress, provider }` | `createOrUpdate{Sui,MetaMask}Profile` |
| POST | `/wallet/register` | `{ identityId, walletAddress }` | `registerWallet` (CAS + idempotent + transfer) |
| POST | `/wallet/remove` | `{ identityId, walletAddress }` | `removeWallet` (last-wallet guard + cleanup) |

POST routes require `Authorization: Bearer <identity-bearer>`. The caller has already
verified the user / wallet proof; the box trusts the bearer and writes. Each write is a
single PG transaction (the lambda `TransactWrite` -> one `sql.begin`).

## Config / secrets

`IDENTITY_PG_SCHEMA` (default `public`) sets the `search_path`, so a smoke test can target
a scratch schema without touching the live mirror. Secrets are delivered via
`systemd LoadCredentialEncrypted` (host-bound tmpfs, never plaintext on disk):

- `pg-password` -- the `nasun_identity` DB password.
- `identity-bearer` -- the server-to-server shared secret.

`nasun_identity` is a least-privilege role: `SELECT/INSERT/UPDATE/DELETE` on
`public.{user_profiles,user_wallets,wallet_owner}` only, **no grant on the issuer schema**.

## Deploy / rollback

`server.mjs` -> `/srv/nasun/identity/server.mjs`; `postgres` is copied from the issuer's
`node_modules` (zero-dependency). The unit goes to `/etc/systemd/system/`. Rollback is
`systemctl disable --now nasun-identity` + `DROP ROLE nasun_identity` (write 0 in S1, so no
data impact); the live mirror is untouched.
