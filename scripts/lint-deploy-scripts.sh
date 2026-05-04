#!/usr/bin/env bash
# Static lint for prod deploy scripts.
#
# Catches the failure class that runtime layers cannot: a typo INSIDE
# `deploy-<app>-production.sh` itself. If pado's deploy script accidentally
# rsyncs into nasun's web root, the .app-id marker check still passes
# because pado's dist correctly contains pado's marker. The damage is
# identical to the 2026-05-03 incident but no live guard catches it.
#
# This linter:
#   1. Reads each scripts/deploy-*-production.sh.
#   2. Extracts APP_NAME and REMOTE_DIR.
#   3. Asserts REMOTE_DIR's path identifies the same app.
#   4. Asserts the rsync command writes to $REMOTE_DIR (no literal /var/www/<other>).
#   5. Asserts verify_app_id (if called) uses the matching marker.
#   6. Warns if verify_app_id is absent on an app that shares EC2 with another app.
#
# Run manually: ./scripts/lint-deploy-scripts.sh
# Auto-runs via PostToolUse hook on Edit/Write of deploy-*-production.sh.
# CI: invoked by .github/workflows/lint-deploy-scripts.yml on PR.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
NC='\033[0m'

# Manifest: APP_NAME -> "remote_dir_substr|app_id_marker|shares_prod_ec2"
# remote_dir_substr: REMOTE_DIR must contain this string.
# app_id_marker:     verify_app_id call must use this exact marker (empty = not required).
# shares_prod_ec2:   1 if this app shares an EC2 host with another app.
declare -A MANIFEST=(
  ["nasun-website"]="/var/www/nasun|nasun-website|1"
  ["pado"]="/var/www/pado.finance|pado-frontend|1"
  ["baram"]="/var/www/baram||1"
  ["network-explorer"]="/var/www/explorer.nasun.io||0"
)

# Apps that don't use EC2 rsync (e.g. S3/CloudFront via CDK). Linter skips these.
declare -A SKIP_NON_EC2=(
  ["gostop"]=1
)

errors=0
warnings=0

fail() { printf "${RED}FAIL${NC} [%s] %s\n" "$1" "$2" >&2; errors=$((errors + 1)); }
warn() { printf "${YEL}WARN${NC} [%s] %s\n" "$1" "$2" >&2; warnings=$((warnings + 1)); }
ok()   { printf "${GRN} OK ${NC} [%s] %s\n" "$1" "$2"; }

extract_var() {
  # extract_var <file> <varname> -> first match of `VARNAME="value"` value
  # Returns empty string if not found (grep no-match must not abort under pipefail).
  local file="$1" var="$2"
  { grep -E "^${var}=" "$file" || true; } | head -1 | sed -E "s/^${var}=\"?([^\"]*)\"?$/\1/"
}

check_script() {
  local file="$1"
  local base
  base=$(basename "$file")

  local app_name remote_dir
  app_name=$(extract_var "$file" APP_NAME)
  remote_dir=$(extract_var "$file" REMOTE_DIR)

  if [ -z "$app_name" ]; then
    fail "$base" "APP_NAME not found"
    return
  fi
  if [ -n "${SKIP_NON_EC2[$app_name]:-}" ]; then
    ok "$base" "skipped (S3/CloudFront, not EC2 rsync)"
    return
  fi
  if [ -z "$remote_dir" ]; then
    fail "$base" "REMOTE_DIR not found"
    return
  fi

  local manifest_entry="${MANIFEST[$app_name]:-}"
  if [ -z "$manifest_entry" ]; then
    warn "$base" "APP_NAME='$app_name' not in linter manifest -- add it to scripts/lint-deploy-scripts.sh MANIFEST"
    return
  fi

  IFS='|' read -r expected_substr expected_marker shares_ec2 <<<"$manifest_entry"

  # Check 1: REMOTE_DIR contains expected substring
  if [[ "$remote_dir" != *"$expected_substr"* ]]; then
    fail "$base" "REMOTE_DIR='$remote_dir' does not contain '$expected_substr' (expected for APP_NAME='$app_name'). This is the cross-app-overwrite class -- HARD FAIL."
    return
  fi

  # Check 2: rsync line for the frontend uses $REMOTE_DIR (not literal path to another app)
  # We look for any rsync line whose destination is a literal /var/www/<X> where X is not the expected dir.
  local bad_rsync
  bad_rsync=$(grep -E '^[[:space:]]*"[^"]*/var/www/[^"]*"' "$file" || true)
  if [ -n "$bad_rsync" ]; then
    # Found a literal /var/www in a quoted string outside variable assignments. Allow only if it contains the expected substring.
    while IFS= read -r line; do
      if [[ "$line" != *"$expected_substr"* ]]; then
        fail "$base" "literal /var/www path that does not match expected '$expected_substr': $(echo "$line" | xargs)"
      fi
    done <<<"$bad_rsync"
  fi

  # Check 3: verify_app_id marker (when present) matches expected
  if grep -qE 'verify_app_id[[:space:]]' "$file"; then
    local actual_marker
    actual_marker=$(grep -E 'verify_app_id[[:space:]]' "$file" | head -1 | sed -E 's/.*verify_app_id[[:space:]]+"[^"]*"[[:space:]]+"([^"]+)".*/\1/')
    if [ -n "$expected_marker" ] && [ "$actual_marker" != "$expected_marker" ]; then
      fail "$base" "verify_app_id marker='$actual_marker' but expected='$expected_marker'"
    fi
  else
    if [ "$shares_ec2" = "1" ]; then
      warn "$base" "verify_app_id call missing on EC2-shared app -- if a sibling app's dist gets rsynced here, nothing catches it. Add verify_app_id call."
    fi
  fi

  if [ "$errors" -eq 0 ]; then
    ok "$base" "APP_NAME=$app_name REMOTE_DIR=$remote_dir"
  fi
}

main() {
  local files
  files=$(ls "$SCRIPT_DIR"/deploy-*-production.sh 2>/dev/null || true)
  if [ -z "$files" ]; then
    echo "No prod deploy scripts found under $SCRIPT_DIR" >&2
    exit 1
  fi

  for f in $files; do
    check_script "$f"
  done

  echo
  if [ "$errors" -gt 0 ]; then
    printf "${RED}lint-deploy-scripts: %d error(s), %d warning(s)${NC}\n" "$errors" "$warnings"
    exit 1
  fi
  if [ "$warnings" -gt 0 ]; then
    printf "${YEL}lint-deploy-scripts: %d warning(s)${NC}\n" "$warnings"
    exit 0
  fi
  printf "${GRN}lint-deploy-scripts: all checks passed${NC}\n"
}

main "$@"
