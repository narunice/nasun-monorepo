# nasun-issuer (box) - self-hosted RS256 JWT issuer + JWKS + zkLogin salt store

The Cognito replacement (AWS-exit Stage 2 §A). Runs on the box as `nasun-issuer.service`, listens on
loopback `:3210`, and is reached publicly at `issuer.nasun.io` through nginx.

| Route | Auth | Purpose |
|---|---|---|
| `GET /.well-known/jwks.json` | public | The public key every verify site fetches. |
| `GET /health` | loopback only (nginx does not route it) | Liveness + whether the DB-backed routes are armed. |
| `POST /mint` | `Bearer <mint-secret>` | Drop-in for Cognito `GetOpenIdTokenForDeveloperIdentity`: credential -> stable `identityId` -> signed nasun JWT. |
| `POST /zklogin/salt` | `Bearer <mint-secret>` | Hosted zkLogin salt store (replaces the zklogin-salt lambda's DynamoDB). |

Callers: `nasun-identity-compute` (`:3212`) calls `/mint` and `/zklogin/salt`. `referral`, `bug-report`,
`leaderboard-v3`, `identity-compute` all verify their JWTs against the loopback JWKS.

## ★ There is no build step

`server.mjs` is hand-written and is **byte-identical to the file running on the box**. That is the point of
this directory, and it is a property the bundled sibling services do not have: what you review here is what
executes in production, and drift is one command away from being proven.

```bash
sha256sum server.mjs
ssh "$BOX_SSH" 'sha256sum /srv/nasun/issuer/server.mjs'
```

Do not introduce esbuild here. Two dependencies (`jose`, `postgres`) do not justify a bundler, and bundling
would trade away the hash check above for a build artifact that nothing verifies.

## Files

- `server.mjs` - the service. Deployed verbatim to `/srv/nasun/issuer/server.mjs`.
- `package.json` / `package-lock.json` - the box installs these with npm into `/srv/nasun/issuer/node_modules`
  (this directory is deliberately outside the pnpm workspace; the service predates and does not use it).
- `deploy/nasun-issuer.service` - the systemd unit, byte-identical to `systemctl cat nasun-issuer`.
- `deploy/grants.sql` - schema, indexes and grants. A rebuild record, not a migration: verified 2026-08-26 to
  reproduce the live ACLs exactly, and a no-op against the running box.

## ★ Blast radius before you touch anything

This is the highest-consequence service on the box. Every other box service verifies user JWTs against its
JWKS, and every login mints through it.

`server.mjs` self-verifies at startup: it mints a token, fetches its own JWKS over loopback, verifies, and
calls `process.exit(1)` if that fails. Combined with `Restart=on-failure` / `RestartSec=2`, a bad deploy is
not a degraded issuer, it is a crash loop, and a crash loop takes **every login across every app** down with
it. The self-check is a good design (it refuses to serve a key inconsistent with the signer) but it means the
rollback path has to be ready before the deploy, not after.

A bug hit by a single request no longer does this: since 2026-08-26 every route runs under a top-level catch,
so a throw becomes one 500 rather than a dead process. Startup failures still exit, by design.

Worse, the loop does not run forever. The unit inherits systemd's defaults (`StartLimitBurst=5`,
`StartLimitIntervalSec=10s`, verified on the box) against `RestartSec=2`, so five failures inside ten seconds
put the unit into `failed` **permanently**. Restarting it then requires:

```bash
ssh "$BOX_SSH" 'sudo systemctl reset-failed nasun-issuer && sudo systemctl start nasun-issuer'
```

Without that command, rolling the file back does not bring the service up, which is a bad thing to discover
while every login is down.

Back up before replacing, and keep the backup off the box:

```bash
scp "$BOX_SSH":/srv/nasun/issuer/server.mjs ~/nasun-backups/box-issuer/<date>/
```

## Deploy

Manual, same "scp one server.mjs" contract as the sibling box services (see
`nasun-ops/docs/box-services-deploy.md`). No deploy script, and `pnpm deploy:*` does not touch this service.

```bash
scp server.mjs "$BOX_SSH":/tmp/issuer-server.mjs
ssh "$BOX_SSH" '
  sudo cp /srv/nasun/issuer/server.mjs /srv/nasun/issuer/server.mjs.bak.$(date +%s) &&
  sudo install -o nasun -g nasun -m 644 /tmp/issuer-server.mjs /srv/nasun/issuer/server.mjs &&
  sudo systemctl restart nasun-issuer &&
  systemctl is-active nasun-issuer &&
  curl -s http://127.0.0.1:3210/health'
```

`/health` must report `"mint":true,"salt":true`. Since 2026-08-26 those fields mean what they say: the mint
secret loaded, and a `SELECT 1` against Postgres answered within 2 seconds. `false` is therefore a real
signal that the DB-backed routes are down while JWKS keeps serving. Roll back by installing the `.bak` file
the same way.

For a stronger check that still writes nothing, look up a salt for a sub that cannot exist. It exercises the
bearer, the DB and the read path at once, and the lookup-only branch never inserts:

```bash
ssh "$BOX_SSH" 'SECRET=$(sudo systemd-creds decrypt --name=mint-secret /srv/nasun/issuer/secrets/mint-secret.cred -)
  curl -s -X POST http://127.0.0.1:3210/zklogin/salt -H "content-type: application/json" \
    -H "Authorization: Bearer $SECRET" -d "{\"provider\":\"google\",\"sub\":\"probe-does-not-exist\"}"'
```

It must answer `{"salt":null}`. Confirm `issuer.zklogin_users` did not grow if you want to be sure.

Dependency changes additionally need `npm ci` in `/srv/nasun/issuer` on the box. Nothing in the workspace
deploy path (`sync_box_workspace_deps`) reaches this directory.

**Ownership note.** `/srv/nasun/issuer/` and its `server.mjs` are owned by `nasun:nasun`, where the sibling
services are `root:root`, so the `sudo` above is not strictly required. This looks like a hardening gap and
is not one: the `nasun` account has `(ALL) NOPASSWD: ALL`, so it can become root at will and chowning the
files to root would not deny it anything. The divergence is cosmetic, and the thing actually protecting the
signing key is `secrets/` being root-only plus the credentials being encrypted to the host key.

## Credentials and the unit

Three secrets arrive through `LoadCredentialEncrypted` into the unit's tmpfs, never plaintext on disk:
`issuer-key` (the RS256 signing key), `pg-password` (the `nasun_issuer` DB role), `mint-secret` (the shared
bearer). They are encrypted to the **box host key** and cannot be decrypted anywhere else. Deleting a `.cred`
does not degrade the service, it makes systemd refuse to start the unit, and the signing key in particular
has no other copy: losing it invalidates every outstanding token and requires a new `kid` plus a JWKS
rollover across all verify sites.

All three `LoadCredentialEncrypted` lines in the repo copy of the unit are active, unlike
`nasun-bug-report.service` where `admin-service-key` is intentionally commented out. Still, confirm the repo
copy matches the box before reinstalling the unit, because that is exactly how a hand-added line gets lost:

```bash
diff <(ssh "$BOX_SSH" 'systemctl cat nasun-issuer') deploy/nasun-issuer.service
```

## Not in this directory

The nginx vhost for `issuer.nasun.io` is **not** checked in. It carries the Cloudflare origin-lock shared
secret that gates every request to the issuer, and this is a public repository. It lives on the box, and its
shape is documented in nasun-ops.

## Database

`issuer.identity_map` (credential -> identityId) and `issuer.zklogin_users` (provider+sub -> salt+address).
The `nasun_issuer` role holds SELECT and INSERT and nothing else. That ceiling is load-bearing, not
decoration: a zkLogin address is derived from its salt, so an UPDATE to a stored salt would silently move a
live user's wallet to a different address. Both write paths use `ON CONFLICT DO NOTHING` so concurrent
first-logins converge on one row instead of overwriting. See `deploy/grants.sql`.

## Defects found and fixed, 2026-08-26

Found while reviewing this file into version control, then fixed, verified and deployed the same day. Kept
here because they describe how this service can fail, which is worth knowing before changing it.

1. **`authorizedMint()` failed open on an empty credential.** If `mint-secret.cred` had ever decrypted to an
   empty or whitespace-only value, a zero-length `Buffer` is truthy so the `if (!secret)` guard did not fire,
   and `timingSafeEqual` of two zero-length buffers is `true`. A request carrying **no** `Authorization`
   header was therefore authorized. Reproduced against the pre-fix file: `POST /mint` with no header reached
   body validation and answered `400 developerUserIdentifier required`, meaning a well-formed body would have
   minted a token for an arbitrary identity. Never live (the credential measures 64 bytes), but one botched
   rotation away. `getMintSecret()` now treats an empty credential as absent, and `authorizedMint()` checks
   the length as well.
2. **A single request could kill the process.** `POST /mint` with the JSON body `null` read a property off
   `null` outside any `try`, and the resulting TypeError rejected the handler promise with nobody listening,
   which on Node ends the process. Reproduced: the server exited 1 and every later probe got ECONNREFUSED.
   With `StartLimitBurst=5` that is a five-request total login outage, and nothing on the box would have
   noticed. Bodies are now parsed in one place that rejects non-objects, and every route runs under a
   top-level catch.
3. **`/health` overstated readiness.** It reported `mint:true,salt:true` whenever the credential path strings
   were set, which is always true under systemd, so it read healthy while `/mint` returned 500. It now
   requires the secret to have loaded and a bounded `SELECT 1` to succeed.
4. **Oversized bodies returned a socket error.** `readBody` destroyed the socket before writing a response,
   so the caller saw `UND_ERR_SOCKET` and the rejection was mislabelled `invalid_json`. It now answers
   `413 body_too_large` and closes after the response flushes.

5. **Routing compared the raw request target.** `req.url === '/.well-known/jwks.json'` meant a cache-busting
   query string, which nginx passes through, fell to the 404 and broke verification for that client. Routes
   now match on the parsed pathname.
6. **A half-specified salt create was answered as a lookup miss.** A body carrying `salt` but no `address`
   (or the reverse) returned `{salt:null}` and persisted nothing, so the caller would hand back an undefined
   address and derive a different one, i.e. a different wallet, on the next login. It is now a 400. A body
   with neither still means lookup, unchanged.
7. **The startup log repeated the derivation removed from `/health`.** It printed `mint=` from the credential
   paths, on the very line the runbook tells operators to read. It now prints `mintSecret=`, which is what it
   actually knows at boot.
8. **Shutdown drained the pool while requests were still using it.** `sql.end()` ran alongside
   `server.close()`, so postgres.js rejected queries the in-flight requests had not issued yet. `/mint` for a
   first-seen credential runs SELECT, INSERT, SELECT, so a routine `systemctl restart` could answer a login
   with 500 after having already written its identity row. Demonstrated by pausing Postgres to hold a request
   mid-sequence and then sending SIGTERM: the old order answered `500 mint_failed`, the new order answers
   `200` with a real token, and the process exits faster too (897ms against 3394ms). The server now closes
   first, then drains, under a hard deadline so a stuck connection cannot outlast systemd's patience.

9. **`/mint` wrote the caller's one `provider` argument into both metadata columns.** Those columns carry a
   vocabulary the Stage-1 migration established over 128k rows: `provider` is where the credential came from
   (`accounts.google.com`, or `nasun.io` for credentials this system issues), `cred_type` is what it is
   (`google`/`sui`/`metamask`/`twitter`). Copying one field into both minted a second vocabulary, and it
   diverged in *both* columns depending on the login kind, so grouping by either split the same users:

   | login | box wrote | vocabulary wants | rows |
   |---|---|---|---|
   | Google | `accounts.google.com` \| `accounts.google.com` | `accounts.google.com` \| `google` | 59 |
   | Sui | `sui` \| `sui` | `nasun.io` \| `sui` | 6,163 |
   | Twitter | `twitter` \| `twitter` | `nasun.io` \| `twitter` | 117 |
   | MetaMask | `metamask` \| `metamask` | `nasun.io` \| `metamask` | 111 |

   `CREDENTIAL_TAXONOMY` now maps the caller's provider to both columns. Its four keys are the complete set
   the callers send (`handlers-google`, `handlers-twitter`, and `finishLogin` for the two wallet kinds), so
   the table is closed rather than guessed. An unrecognised provider is stored verbatim with a null
   `cred_type` and logged: inventing a fifth vocabulary silently is what caused this in the first place.
   Nothing in the serving path reads either column, so this is about forensics and reporting, not behavior.

   The 6,450 rows already written in the box vocabulary are **not** corrected by this change. Normalising
   them needs an UPDATE, which the issuer role deliberately does not have, so it would be a one-off owner
   statement. `source` already distinguishes the eras (`login` against `lookup`/`zklogin_join`), so
   normalising loses nothing, but it is a production write on the identity table and belongs behind an
   explicit decision rather than inside a deploy.

Verified before deploying: a throwaway Postgres was built from `deploy/grants.sql` and the patched service
was run against it, covering first-seen mint, repeat mint returning the same identityId, the minted token
verifying against the served JWKS, salt create, salt lookup, and a second create with a different salt
leaving the stored salt and address untouched. Then re-verified on the box with read-only probes, with the
row counts unchanged either side.

## Known gap: nothing watches this service

The box runs watchdog timers for disk, prediction, news-feed and request-rate, and none of them look at the
issuer. The host that ran `box-health-monitor.sh` was decommissioned with the AWS exit. So if this service
does enter `failed`, every login stops and the first signal is a user complaint. That is the real reason the
restart limit matters, and it is a gap in monitoring rather than in the restart policy.
