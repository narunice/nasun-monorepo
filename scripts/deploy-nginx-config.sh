#!/bin/bash
# ==============================================================================
# nginx config deploy/diff (prod EC2 43.200.67.52)
#
# Modes:
#   diff   — read-only, prod ↔ rendered baseline divergence report
#   apply  — render snapshots+secrets → push to prod, nginx -t, reload, health check
#
# Drift detection on apply: aborts if prod has uncommitted changes vs git baseline.
# To override (after manual review): apply --force.
#
# Source of truth: infra/nginx/snapshots/  (placeholders like __CF_ORIGIN_SECRET_NASUN__)
# Secrets:         infra/nginx/secrets.env (gitignored, env-style)
# Backup:          prod auto creates /etc/nginx/<file>.bak.<timestamp> via PreToolUse hook,
#                  plus this script creates one before each apply.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/_common.sh"

PROD_HOST="ec2-user@43.200.67.52"
SSH_KEY="$HOME/.ssh/.awskey/nasun-prod-key"
SSH_OPTS="-i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no"
SNAP_DIR="$REPO_ROOT/infra/nginx/snapshots"
SECRETS_FILE="$REPO_ROOT/infra/nginx/secrets.env"

MODE="${1:-diff}"
FORCE="${2:-}"

if [ ! -d "$SNAP_DIR" ]; then
  log_error "Snapshot directory not found: $SNAP_DIR"
fi

if [ ! -f "$SSH_KEY" ]; then
  log_error "SSH key not found: $SSH_KEY"
fi

if [ ! -f "$SECRETS_FILE" ]; then
  log_error "Secrets file not found: $SECRETS_FILE (copy from secrets.env.example)"
fi

# Files to manage. Path is relative to /etc/nginx/.
FILES=(
  "nginx.conf"
  "conf.d/baram.conf"
  "conf.d/explorer.conf"
  "conf.d/nasun-rate-limit.conf"
  "conf.d/nasun.conf"
  "conf.d/pado.finance.conf"
  "conf.d/php-fpm.conf"
  "conf.d/rpc-cache.conf"
  "conf.d/wordpress.conf"
)

# Load secrets.env into environment.
load_secrets() {
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
  for var in CF_ORIGIN_SECRET_NASUN CF_ORIGIN_SECRET_PADO; do
    if [ -z "${!var}" ] || [ "${!var}" = "__SET_ME__" ]; then
      log_error "Secret not set in $SECRETS_FILE: $var"
    fi
  done
}

# Render snapshot file with secrets substituted into placeholders.
# Stdout: rendered content. Aborts if any __PLACEHOLDER__ remains.
render_file() {
  local src="$1"
  sed -e "s|__CF_ORIGIN_SECRET_NASUN__|${CF_ORIGIN_SECRET_NASUN}|g" \
      -e "s|__CF_ORIGIN_SECRET_PADO__|${CF_ORIGIN_SECRET_PADO}|g" \
      "$src" | tee /tmp/_nginx_render_check >/dev/null
  # Safety: any unsubstituted __PLACEHOLDER__ blocks deploy.
  if grep -qE '__[A-Z_]+__' /tmp/_nginx_render_check; then
    log_error "Unsubstituted placeholder in rendered $src — secrets.env incomplete?"
  fi
  cat /tmp/_nginx_render_check
  rm -f /tmp/_nginx_render_check
}

fetch_prod_file() {
  local f="$1"
  ALLOW_PROD_DIRECT=1 ssh $SSH_OPTS "$PROD_HOST" "sudo cat /etc/nginx/$f" 2>/dev/null
}

cmd_diff() {
  log_info "Comparing prod /etc/nginx/ with rendered baseline (snapshots + secrets)"
  local drift=0
  local tmp
  tmp=$(mktemp -d)
  trap "rm -rf $tmp" EXIT

  load_secrets

  for f in "${FILES[@]}"; do
    local src="$SNAP_DIR/$f"
    local rendered="$tmp/rendered_${f//\//_}"
    local prod="$tmp/prod_${f//\//_}"
    if [ ! -f "$src" ]; then
      log_warning "Missing in baseline: $f"
      drift=$((drift + 1))
      continue
    fi
    render_file "$src" > "$rendered"
    fetch_prod_file "$f" > "$prod"
    if ! diff -q "$rendered" "$prod" >/dev/null 2>&1; then
      log_warning "DRIFT: $f"
      diff -u "$rendered" "$prod" | head -30
      drift=$((drift + 1))
    fi
  done

  if [ "$drift" -eq 0 ]; then
    log_success "No drift. prod == rendered baseline."
    exit 0
  else
    log_warning "Drift detected in $drift file(s)."
    exit 2
  fi
}

cmd_apply() {
  log_info "Applying rendered baseline → prod"
  load_secrets

  # 1. Drift check unless --force
  if [ "$FORCE" != "--force" ]; then
    log_info "Pre-flight drift check..."
    set +e
    cmd_diff
    rc=$?
    set -e
    if [ "$rc" -eq 2 ]; then
      log_error "Prod has uncommitted changes. Review with 'diff' or pass '--force' after manual confirmation."
    fi
  fi

  # 2. Render + stage + push each file
  log_info "Rendering and syncing files..."
  local stage_dir
  stage_dir=$(mktemp -d)
  trap "rm -rf $stage_dir" EXIT
  for f in "${FILES[@]}"; do
    local src="$SNAP_DIR/$f"
    [ -f "$src" ] || { log_warning "Skip missing: $f"; continue; }
    local rendered="$stage_dir/${f//\//_}"
    render_file "$src" > "$rendered"
    ALLOW_PROD_DIRECT=1 rsync -e "ssh $SSH_OPTS" -av "$rendered" "$PROD_HOST:/tmp/nginx-staging-${f//\//_}" >/dev/null
    ALLOW_PROD_DIRECT=1 ssh $SSH_OPTS "$PROD_HOST" "sudo cp /etc/nginx/$f /etc/nginx/$f.bak.\$(date +%Y%m%d-%H%M%S) 2>/dev/null || true; sudo mv /tmp/nginx-staging-${f//\//_} /etc/nginx/$f; sudo chown root:root /etc/nginx/$f"
    log_success "Pushed: $f"
  done

  # 3. nginx -t
  log_info "Validating nginx config..."
  if ! ALLOW_PROD_DIRECT=1 ssh $SSH_OPTS "$PROD_HOST" "sudo nginx -t" 2>&1 | grep -qE "syntax is ok|test is successful"; then
    log_error "nginx -t failed. Restore from .bak.* manually."
  fi

  # 4. Reload
  log_info "Reloading nginx..."
  ALLOW_PROD_DIRECT=1 ssh $SSH_OPTS "$PROD_HOST" "sudo systemctl reload nginx"

  # 5. Health check
  log_info "Health check..."
  for url in "https://nasun.io" "https://pado.finance" "https://explorer.nasun.io/api/v1/health"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$url")
    if [[ "$code" =~ ^(200|301|302)$ ]]; then
      log_success "$url → $code"
    else
      log_warning "$url → $code (review manually)"
    fi
  done

  log_success "nginx config deployed."
}

case "$MODE" in
  diff)  cmd_diff ;;
  apply) cmd_apply ;;
  *)     log_error "Usage: $0 {diff|apply} [--force]" ;;
esac
