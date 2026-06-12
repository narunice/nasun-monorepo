# nasun-identity-compute (box) — de-Lambda compute service (C0)

Box-co-located compute surface that progressively absorbs identity Lambda handler logic. Sibling of
`nasun-identity` (CRUD, :3211) and `nasun-issuer` (mint/JWKS, :3210). This service = :3212.

Design SSOT: `~/.claude/plans/2026-06-12-aws-exit-delambda-compute-lift-design.md` +
`...-C0-C1-slice-design.md`. C0 = scaffold (`/health`, `/count`). All live steps need explicit go.

## Files

- `server.mjs` — the service (hand-written .mjs, box convention; TS migration deferred to C3).
- `nasun-identity-compute.service` — systemd unit (clones nasun-identity hardening; port 3212, role
  `nasun_compute_ro`, `compute-bearer`). **★ EGRESS NOTE inside: C0/C1 loopback-only; later egress slices
  must relax `IPAddressAllow`.**

## One-time box setup (explicit go — machine-local DDL + secrets)

### 1. Generate secrets FIRST (single source of truth for the role password)

```bash
PGPW=$(openssl rand -hex 24)        # nasun_compute_ro DB password (used in BOTH step 2 SQL and step 3 cred)
CBEAR=$(openssl rand -hex 32)       # the API Gateway will present this as the bearer
```
★ Generate `PGPW` once here and reuse it; do NOT regenerate it in the SQL or the cred step (a mismatch
crash-loops the service on boot when `nasun_compute_ro` auth fails).

### 2. PG role (SELECT-only, grows per slice) — consumes `$PGPW` from step 1

```bash
sudo -u postgres psql -d nasun_dal <<SQL
CREATE ROLE nasun_compute_ro LOGIN PASSWORD '${PGPW}';
GRANT CONNECT ON DATABASE nasun_dal TO nasun_compute_ro;
GRANT USAGE ON SCHEMA public TO nasun_compute_ro;
GRANT SELECT ON public.user_profiles TO nasun_compute_ro;
SQL
```
Least-privilege: no INSERT/UPDATE/DELETE, no issuer schema, only the tables a slice needs (C1 = user_profiles).

### 3. Service dir + deps + encrypted secrets (root) — consumes `$PGPW`/`$CBEAR` from step 1

```bash
sudo install -d -o root -g root -m 0755 /srv/nasun/identity-compute
sudo install -d -o root -g root -m 0700 /srv/nasun/identity-compute/secrets

# postgres npm lib: vendor ONLY postgres (do NOT inherit nasun-identity's full node_modules -- that
# couples the services and drags unused deps into a SELECT-only service). postgres@3.x is
# ZERO-DEPENDENCY (package.json dependencies == {}), so copying just its subdir is complete + minimal.
# (This is what the live C0 deploy used; equivalent to `npm install postgres@<sibling-version>`.)
sudo install -d -o root -g root -m 0755 /srv/nasun/identity-compute/node_modules
sudo cp -a /srv/nasun/identity/node_modules/postgres /srv/nasun/identity-compute/node_modules/postgres
node -e "require('/srv/nasun/identity-compute/node_modules/postgres')" && echo "postgres resolvable: OK"

# secrets -> systemd-creds encrypted (host-bound; no plaintext at rest)
printf '%s' "$PGPW"  | sudo systemd-creds encrypt --name=pg-password    - /srv/nasun/identity-compute/secrets/pg-password.cred
printf '%s' "$CBEAR" | sudo systemd-creds encrypt --name=compute-bearer - /srv/nasun/identity-compute/secrets/compute-bearer.cred
# record CBEAR securely for the API Gateway integration header (do NOT store plaintext offsite).
unset PGPW CBEAR   # clear from the shell after use
```

### 4. Deploy server.mjs (the box-script ritual)

```bash
# local: node --check before scp
node --check apps/network-explorer/api-server/src/scripts/nasun-identity-compute/server.mjs
scp -i ~/.ssh/hetzner-ax102 \
  apps/network-explorer/api-server/src/scripts/nasun-identity-compute/server.mjs \
  nasun@37.27.112.156:/tmp/identity-compute-server.mjs        # ★ keep .mjs ext (ESM)
# box:
ssh ... 'node --check /tmp/identity-compute-server.mjs && \
  sudo install -o root -g root -m 0644 /tmp/identity-compute-server.mjs /srv/nasun/identity-compute/server.mjs && rm /tmp/identity-compute-server.mjs'
```

### 5. Install unit + start

```bash
scp ... nasun-identity-compute.service nasun@...:/tmp/
ssh ... 'sudo install -m 0644 /tmp/nasun-identity-compute.service /etc/systemd/system/ && \
  sudo systemctl daemon-reload && sudo systemctl enable --now nasun-identity-compute && \
  systemctl is-active nasun-identity-compute && systemctl show nasun-identity-compute -p NRestarts --value'
```

### 6. nginx route (add to `/etc/nginx/sites-enabled/issuer.nasun.io`)

Insert alongside the existing `location /identity/`:

```nginx
location /compute/ {
    limit_req zone=issuer_auth burst=40 nodelay;
    proxy_pass http://127.0.0.1:3212/;
    proxy_set_header Host $host;
}
```
Then `sudo nginx -t && sudo systemctl reload nginx`. The Cloudflare origin-lock (`x-issuer-origin`) and
rate-limit already apply (they wrap the whole server block).

## Smoke (in-box loopback, with bearer)

```bash
# Decrypt the bearer into an env var without echoing it (avoid shell history / process listing).
CBEAR=$(sudo systemd-creds decrypt --name=compute-bearer /srv/nasun/identity-compute/secrets/compute-bearer.cred -)
curl -s http://127.0.0.1:3212/health                                   # {status:ok,...} no bearer
curl -s -H "authorization: Bearer $CBEAR" http://127.0.0.1:3212/count  # {count:N,...}
curl -s http://127.0.0.1:3212/count                                    # 401 (no bearer)
# via Cloudflare (public path), proves origin-lock + nginx route:
curl -s -H "authorization: Bearer $CBEAR" https://issuer.nasun.io/compute/count
unset CBEAR   # clear the plaintext bearer from the shell
```
Parity: `/compute/count` `count` must equal nasun-identity `/identity/profile/count` (same SQL, same row).

## Rollback

`sudo systemctl disable --now nasun-identity-compute` + remove the nginx `/compute/` location +
`reload nginx`. Zero impact on issuer/identity (separate unit, port, role).

## Slice C1 (separate go)

Repoint `nasun-common-get-user-count` API Gateway `/count` integration from Lambda-proxy to HTTP-proxy
→ `https://issuer.nasun.io/compute/count`, injecting `authorization: Bearer <compute-bearer>` as a static
integration request header. Lambda stays deployed-but-bypassed (rollback). See C0-C1 slice design doc.
