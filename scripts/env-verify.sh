#!/bin/bash
# env-verify.sh
# Verify that VITE_* values from the app's .env files are embedded in the
# built dist/assets/*.js bundles. Catches "changed .env but forgot rebuild"
# and "envDir misconfig" regressions.
#
# Usage: ./scripts/env-verify.sh <app> [--mode production|development]
# Exit:  0 = all values MATCH (or safely SKIPPED)
#        1 = at least one value MISSING from bundle
#        2 = setup error (unknown app, dist missing, etc.)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

APP="${1:-}"
MODE="production"

shift 2>/dev/null || true
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --mode=*) MODE="${1#--mode=}"; shift ;;
    *) shift ;;
  esac
done

case "$APP" in
  nasun-website)
    ENV_DIR="$MONOREPO_ROOT/apps/nasun-website/frontend"
    DIST="$MONOREPO_ROOT/apps/nasun-website/frontend/dist"
    ;;
  pado)
    # Vite envDir:'../' — reads apps/pado/.env*, not apps/pado/frontend/.env*
    ENV_DIR="$MONOREPO_ROOT/apps/pado"
    DIST="$MONOREPO_ROOT/apps/pado/frontend/dist"
    ;;
  gensol-website)
    ENV_DIR="$MONOREPO_ROOT/apps/gensol-website/frontend"
    DIST="$MONOREPO_ROOT/apps/gensol-website/frontend/dist"
    ;;
  network-explorer)
    ENV_DIR="$MONOREPO_ROOT/apps/network-explorer"
    DIST="$MONOREPO_ROOT/apps/network-explorer/dist"
    ;;
  baram)
    ENV_DIR="$MONOREPO_ROOT/apps/baram/frontend"
    DIST="$MONOREPO_ROOT/apps/baram/frontend/dist"
    ;;
  "")
    echo "Usage: $0 <app> [--mode production|development]" >&2
    echo "Apps: nasun-website, pado, gensol-website, network-explorer, baram" >&2
    exit 2
    ;;
  *)
    echo "env-verify: unknown app '$APP'" >&2
    exit 2
    ;;
esac

if [ ! -d "$DIST" ]; then
  echo "env-verify: dist directory not found: $DIST (build first)" >&2
  exit 2
fi

# Collect JS bundles into an array
shopt -s nullglob
BUNDLES=("$DIST"/assets/*.js)
shopt -u nullglob
if [ ${#BUNDLES[@]} -eq 0 ]; then
  echo "env-verify: no JS bundles in $DIST/assets/ (build first)" >&2
  exit 2
fi

# Load env files in Vite priority order (low to high — later wins)
declare -A ENV_MAP
declare -A ENV_SOURCE
for f in "$ENV_DIR/.env" "$ENV_DIR/.env.$MODE" "$ENV_DIR/.env.local" "$ENV_DIR/.env.$MODE.local"; do
  [ -f "$f" ] || continue
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^[[:space:]]*(VITE_[A-Za-z0-9_]+)=(.*)$ ]]; then
      k="${BASH_REMATCH[1]}"
      v="${BASH_REMATCH[2]}"
      # Strip surrounding single or double quotes (one pair)
      if [[ "$v" =~ ^\"(.*)\"$ ]]; then v="${BASH_REMATCH[1]}"; fi
      if [[ "$v" =~ ^\'(.*)\'$ ]]; then v="${BASH_REMATCH[1]}"; fi
      ENV_MAP[$k]="$v"
      ENV_SOURCE[$k]="$(basename "$f")"
    fi
  done < "$f"
done

if [ ${#ENV_MAP[@]} -eq 0 ]; then
  echo "env-verify: no VITE_* keys defined in $ENV_DIR/.env* (mode=$MODE) — nothing to verify"
  exit 0
fi

echo "env-verify: $APP (mode=$MODE)"
echo "  env dir: $ENV_DIR"
echo "  dist:    $DIST/assets/ (${#BUNDLES[@]} bundle$([ ${#BUNDLES[@]} -gt 1 ] && echo s))"
echo ""

MATCH=0; MISS=0; SKIP=0
MISSING_LIST=""
for k in $(echo "${!ENV_MAP[@]}" | tr ' ' '\n' | sort); do
  v="${ENV_MAP[$k]}"
  src="${ENV_SOURCE[$k]}"
  vlen=${#v}
  if [ "$vlen" -lt 10 ]; then
    printf "  %-40s SKIP     (short value, %d chars) [%s]\n" "$k" "$vlen" "$src"
    SKIP=$((SKIP+1))
    continue
  fi
  disp="$v"
  if [ ${#disp} -gt 48 ]; then
    disp="${disp:0:45}..."
  fi
  if grep -Fq -- "$v" "${BUNDLES[@]}" 2>/dev/null; then
    printf "  %-40s MATCH    %s [%s]\n" "$k" "$disp" "$src"
    MATCH=$((MATCH+1))
  else
    printf "  %-40s MISSING  %s [%s]\n" "$k" "$disp" "$src"
    MISS=$((MISS+1))
    MISSING_LIST="${MISSING_LIST}    - ${k} (expected from ${src})"$'\n'
  fi
done

echo ""
echo "  summary: $MATCH match, $MISS missing, $SKIP skipped"

if [ "$MISS" -gt 0 ]; then
  echo ""
  echo "MISSING keys — value from .env not found in dist bundles:"
  printf '%s' "$MISSING_LIST"
  echo ""
  echo "  Likely causes:"
  echo "    1. Stale build (most common) — rebuild, then re-run env-verify"
  echo "    2. Key defined in .env but not referenced in src (unused)"
  echo "    3. .env.local overriding .env.$MODE with a different value"
  exit 1
fi

exit 0
