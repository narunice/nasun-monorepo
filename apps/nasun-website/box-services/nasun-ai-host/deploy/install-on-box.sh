#!/bin/bash
# ==============================================================================
# nasun-ai-host — one-shot box install (run ON the box, as `nasun`)
# ==============================================================================
# Performs the two privileged steps that bring the AI host online:
#
#   1. install the bundle + systemd unit as root, enable and start the service,
#      then prove it healthy and signing as the registered executor;
#   2. point chat-server's AGENT_GLOBAL_HOST_URL at it and drop the stale
#      AGENT_VAULT_RETIRED flag.
#
# Order is deliberate: step 2 only runs if step 1 proved healthy. A half-applied
# state where chat-server points at a dead port is worse than not starting, and
# the runtime deploy script hard-fails on the AWS URL, so leaving .env untouched
# keeps the system in a state whose failure mode is already understood.
#
# Idempotent: re-running reinstalls the same bytes, restarts the service, and
# leaves .env alone when it already holds the right values.
#
# Usage, from anywhere on the box:
#     bash /tmp/install-nasun-ai-host.sh
#
# Expects, already in place (installed 2026-10-05):
#   /etc/nasun/nasun-ai-host/executor.key        0400 root  (nasun-ai-executor-prod)
#   /etc/nasun/nasun-ai-host/provider-keys.env   0600 root  (7 providers + HOST_API_KEY)
#   /tmp/nasun-ai-host-server.mjs                staged bundle
#   /tmp/nasun-ai-host.service                   staged unit
# ==============================================================================
set -euo pipefail

BUNDLE_SRC=/tmp/nasun-ai-host-server.mjs
UNIT_SRC=/tmp/nasun-ai-host.service
BUNDLE_SHA=3a433cf8fab3d346a2c45204474523ac360f10e6115f002e465997c73d0b0733
UNIT_SHA=d6c3e6c46e05ceec4d1ea997475e62e42f16c7b0485314e3c67196ec2e2bc69a

SRV_DIR=/srv/nasun/nasun-ai-host
SECRET_DIR=/etc/nasun/nasun-ai-host
CHAT_DIR="$HOME/nasun-monorepo/apps/nasun-website/chat-server"
HEALTH_URL=http://127.0.0.1:4500/health
EXPECTED_EXECUTOR=0x6f516935f336545fa89365f53e0cbd9f5e02399d08eb309fee6e8e130262ee8f

ok()   { printf '  \033[0;32mok\033[0m    %s\n' "$*"; }
info() { printf '  \033[0;34m..\033[0m    %s\n' "$*"; }
die()  { printf '  \033[0;31mFAIL\033[0m  %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }

step "0. preflight"

[ -f "$BUNDLE_SRC" ] || die "staged bundle missing: $BUNDLE_SRC"
[ -f "$UNIT_SRC" ]   || die "staged unit missing: $UNIT_SRC"

got_bundle=$(sha256sum "$BUNDLE_SRC" | cut -d' ' -f1)
got_unit=$(sha256sum "$UNIT_SRC" | cut -d' ' -f1)
[ "$got_bundle" = "$BUNDLE_SHA" ] || die "bundle hash mismatch: got $got_bundle"
[ "$got_unit" = "$UNIT_SHA" ]     || die "unit hash mismatch: got $got_unit"
ok "staged artifacts match the reviewed build"

sudo test -f "$SECRET_DIR/executor.key"      || die "$SECRET_DIR/executor.key missing"
sudo test -f "$SECRET_DIR/provider-keys.env" || die "$SECRET_DIR/provider-keys.env missing"
ok "executor key + provider keys present"

[ -f "$CHAT_DIR/.env" ] || die "chat-server .env not found at $CHAT_DIR/.env"
ok "chat-server .env found"

step "1. install + start nasun-ai-host"

sudo install -d -m 0755 -o root -g root "$SRV_DIR"
sudo install -m 0644 -o root -g root "$BUNDLE_SRC" "$SRV_DIR/server.mjs"
sudo install -m 0644 -o root -g root "$UNIT_SRC" /etc/systemd/system/nasun-ai-host.service
ok "bundle -> $SRV_DIR/server.mjs, unit -> /etc/systemd/system/"

sudo systemctl daemon-reload
ok "daemon-reload"

sudo systemctl enable nasun-ai-host >/dev/null 2>&1
sudo systemctl restart nasun-ai-host
info "waiting for $HEALTH_URL ..."

health=''
for _ in $(seq 1 30); do
  sleep 1
  if health=$(curl -fsS -m 3 "$HEALTH_URL" 2>/dev/null); then break; fi
  health=''
done

if [ -z "$health" ]; then
  printf '\n'
  die "service did not become healthy. It exits non-zero on a bad key or a
        missing provider key rather than serving, so the reason is in the
        journal:

            sudo journalctl -u nasun-ai-host -n 40 --no-pager

        .env was NOT touched, so nothing else changed. Paste the journal
        output back and I will take it from there."
fi

ok "healthy: $health"

executor=$(printf '%s' "$health" | sed -n 's/.*"executor":"\([^"]*\)".*/\1/p')
[ -n "$executor" ] || die "could not read executor address out of /health"
if [ "$executor" != "$EXPECTED_EXECUTOR" ]; then
  die "executor mismatch.
        serving:  $executor
        expected: $EXPECTED_EXECUTOR
        The installed key is not the registered executor, so every settlement
        would abort on chain. .env was NOT touched."
fi
ok "signing as the registered executor"

step "2. point chat-server at it"

cd "$CHAT_DIR"
cur_url=$(grep -E '^AGENT_GLOBAL_HOST_URL=' .env | head -1 | cut -d= -f2- || true)
has_retired=$(grep -c '^AGENT_VAULT_RETIRED=' .env || true)

if [ "$cur_url" = "http://127.0.0.1:4500" ] && [ "$has_retired" = "0" ]; then
  ok ".env already correct; left untouched"
else
  backup=".env.bak.$(date +%s)"
  cp .env "$backup" && chmod 600 "$backup"
  ok "backup: $CHAT_DIR/$backup"

  sed -i 's|^AGENT_GLOBAL_HOST_URL=.*|AGENT_GLOBAL_HOST_URL=http://127.0.0.1:4500|' .env
  sed -i '/^AGENT_VAULT_RETIRED=/d' .env

  new_url=$(grep -E '^AGENT_GLOBAL_HOST_URL=' .env | head -1 | cut -d= -f2-)
  [ "$new_url" = "http://127.0.0.1:4500" ] || die "HOST_URL rewrite did not take: $new_url"
  [ "$(grep -c '^AGENT_VAULT_RETIRED=' .env || true)" = "0" ] || die "AGENT_VAULT_RETIRED still present"
  ok "AGENT_GLOBAL_HOST_URL -> http://127.0.0.1:4500"
  ok "AGENT_VAULT_RETIRED removed"
fi

step "done"
cat <<'EOF'
  The host is live and chat-server is configured to use it.

  Nothing restarted chat-server yet, so no user-visible change has happened:
  it does not read .env at runtime, so the new values take effect only on the
  delete+start that comes next.

  Still to do (I will run these):
    - deploy the agent runtime to the box
    - chat-server deploy + hard restart  (chat/leaderboard, up to ~2 min)
    - clear 10 stale wake-routing rows and reopen the alpha queue
    - activate one agent on a small test wallet and watch a full cycle

  Tell me this finished and I will carry on. I also need the test wallet
  address for the last step.

  Rollback for what this script did:
    sudo systemctl disable --now nasun-ai-host
    sudo rm /etc/systemd/system/nasun-ai-host.service && sudo systemctl daemon-reload
    cd <chat-server> && cp .env.bak.<timestamp> .env
EOF
