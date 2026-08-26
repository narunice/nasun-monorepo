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

`/health` should report `"mint":true,"salt":true`, but do not read more into it than it says: both fields are
derived from whether the credential *paths* are set, not from the credentials decrypting or Postgres being
reachable. `true` therefore does not prove `/mint` works. Confirm the real thing with an authenticated call,
or at minimum check `journalctl -u nasun-issuer` for the startup line and the absence of `mint_failed`.
Roll back by installing the `.bak` file the same way.

Dependency changes additionally need `npm ci` in `/srv/nasun/issuer` on the box. Nothing in the workspace
deploy path (`sync_box_workspace_deps`) reaches this directory.

**Observed divergence, worth closing:** the sibling services deploy as `root:root 644` into a root-owned
directory, but `/srv/nasun/issuer/` and its `server.mjs` are owned by `nasun:nasun`. The `sudo` above is
therefore not actually required today, which is the problem: the unprivileged login account can rewrite the
code of the service that holds the signing key. `secrets/` is correctly root-only, so this is not an
immediate key exposure, but chowning the directory and `server.mjs` to `root:root` would bring the issuer up
to the sibling posture. Not changed here, since it is a live change unrelated to putting the source under
version control.

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

## Known defects (present in production, not yet fixed)

Found reviewing this file into version control on 2026-08-26. Nothing here is a regression: it is the
behavior running today. They are recorded rather than patched because fixing them means deploying the
issuer, which is the highest-blast-radius operation on the box and deserves its own deliberate change.

1. **`authorizedMint()` fails open on an empty credential** (`server.mjs:96`). If `mint-secret.cred` ever
   decrypts to an empty or whitespace-only value, `Buffer.from('')` is truthy so the `if (!secret)` guard
   does not fire, and `timingSafeEqual` of two zero-length buffers returns `true`. A request with **no**
   `Authorization` header would then be authorized, which on `/mint` means minting a signed JWT for an
   arbitrary `developerUserIdentifier`, i.e. impersonating any user. Not live today (the credential measures
   64 bytes), and the nginx origin-lock is a second gate, but a botched credential rotation would silently
   open the service. Fix: `if (!secret || secret.length === 0) return false;`.
2. **`/health` overstates readiness** (`server.mjs:179`). `dbBacked` tests that the credential path strings
   are set, which is always true under systemd, so it reports `true` while `/mint` returns 503 or 500. It
   should test that the credentials actually loaded and that a trivial DB query succeeds.
3. **Oversized bodies get a socket error instead of a 400** (`server.mjs:160`). `readBody` calls
   `req.destroy()` before any response is written, so the caller sees a transport error, and the rejection is
   also mislabelled `invalid_json` by the surrounding catch. Cap is 4096 bytes, so this is cosmetic.
4. **Restart limit** (`deploy/nasun-issuer.service:11`). See the blast-radius section: consider
   `StartLimitIntervalSec=0`, or accept the fail-fast behavior and keep `reset-failed` in the runbook.
