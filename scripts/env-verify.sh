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
    SRC_DIR="$MONOREPO_ROOT/apps/nasun-website/frontend/src"
    DIST="$MONOREPO_ROOT/apps/nasun-website/frontend/dist"
    ;;
  pado)
    # Vite envDir:'../' — reads apps/pado/.env*, not apps/pado/frontend/.env*
    ENV_DIR="$MONOREPO_ROOT/apps/pado"
    SRC_DIR="$MONOREPO_ROOT/apps/pado/frontend/src"
    DIST="$MONOREPO_ROOT/apps/pado/frontend/dist"
    ;;
  gensol-website)
    ENV_DIR="$MONOREPO_ROOT/apps/gensol-website/frontend"
    SRC_DIR="$MONOREPO_ROOT/apps/gensol-website/frontend/src"
    DIST="$MONOREPO_ROOT/apps/gensol-website/frontend/dist"
    ;;
  network-explorer)
    ENV_DIR="$MONOREPO_ROOT/apps/network-explorer"
    SRC_DIR="$MONOREPO_ROOT/apps/network-explorer/src"
    DIST="$MONOREPO_ROOT/apps/network-explorer/dist"
    ;;
  baram)
    ENV_DIR="$MONOREPO_ROOT/apps/baram/frontend"
    SRC_DIR="$MONOREPO_ROOT/apps/baram/frontend/src"
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

# Staleness check: if any .env* file was modified after the newest bundle,
# the build is stale relative to current env regardless of whether grep can
# find each value. This catches boolean-valued flag flips (true/false) that
# the per-value grep cannot reliably verify because Vite dead-code-eliminates
# `import.meta.env.VITE_*` boolean comparisons at build time.
newest_env_file=""
for f in "$ENV_DIR"/.env "$ENV_DIR"/.env.local "$ENV_DIR"/.env.$MODE "$ENV_DIR"/.env.$MODE.local; do
  [ -f "$f" ] || continue
  if [ -z "$newest_env_file" ] || [ "$f" -nt "$newest_env_file" ]; then
    newest_env_file="$f"
  fi
done
newest_bundle="${BUNDLES[0]}"
for b in "${BUNDLES[@]}"; do
  if [ "$b" -nt "$newest_bundle" ]; then
    newest_bundle="$b"
  fi
done
if [ -n "$newest_env_file" ] && [ "$newest_env_file" -nt "$newest_bundle" ]; then
  echo "env-verify: STALE BUILD" >&2
  echo "  $(basename "$newest_env_file") was modified after $(basename "$newest_bundle")" >&2
  echo "  Rebuild before deploying: pnpm build:$APP" >&2
  exit 1
fi

# Load env files in Vite priority order (low to high; later wins).
# Per Vite docs: .env.[mode] takes higher priority than .env.local.
# Order: .env → .env.local → .env.[mode] → .env.[mode].local
declare -A ENV_MAP
declare -A ENV_SOURCE
for f in "$ENV_DIR/.env" "$ENV_DIR/.env.local" "$ENV_DIR/.env.$MODE" "$ENV_DIR/.env.$MODE.local"; do
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

MATCH=0; MISS=0; SKIP=0; UNUSED=0; BOOL_FLAG=0
MISSING_LIST=""
BOOL_LIST=""

# Build set of VITE_ keys actually referenced in source (import.meta.env.VITE_*)
declare -A SRC_REFS
if [ -d "$SRC_DIR" ]; then
  while IFS= read -r ref_key; do
    SRC_REFS[$ref_key]=1
  done < <(grep -rh "import\.meta\.env\.VITE_" "$SRC_DIR" --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null \
    | grep -oP 'VITE_[A-Za-z0-9_]+' | sort -u)
fi

for k in $(echo "${!ENV_MAP[@]}" | tr ' ' '\n' | sort); do
  v="${ENV_MAP[$k]}"
  src="${ENV_SOURCE[$k]}"
  vlen=${#v}
  # Boolean-ish values cannot be reliably grepped in a Vite bundle because
  # Vite dead-code-eliminates `import.meta.env.VITE_FOO === 'true'` at build
  # time. The pre-flight staleness check above is the real guard for these
  # keys; here we surface them explicitly so the operator knows to confirm.
  if [[ "$v" =~ ^(true|false|0|1)$ ]]; then
    printf "  %-40s BOOL     %s [%s] (staleness pre-check is authoritative)\n" "$k" "$v" "$src"
    BOOL_FLAG=$((BOOL_FLAG+1))
    BOOL_LIST="${BOOL_LIST}    - ${k}=${v} (${src})"$'\n'
    continue
  fi
  if [ "$vlen" -lt 10 ]; then
    printf "  %-40s SKIP     (short value, %d chars) [%s]\n" "$k" "$vlen" "$src"
    SKIP=$((SKIP+1))
    continue
  fi
  disp="$v"
  if [ ${#disp} -gt 48 ]; then
    disp="${disp:0:45}..."
  fi
  # If key is not referenced in source, it won't be embedded by Vite — this is expected
  if [ -z "${SRC_REFS[$k]+x}" ]; then
    printf "  %-40s UNUSED   %s [%s]\n" "$k" "$disp" "$src"
    UNUSED=$((UNUSED+1))
    continue
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
echo "  summary: $MATCH match, $MISS missing, $SKIP skipped, $UNUSED unused(not in src), $BOOL_FLAG boolean"

if [ "$MISS" -gt 0 ]; then
  echo ""
  echo "MISSING keys: referenced in src but value not found in dist bundles:"
  printf '%s' "$MISSING_LIST"
  echo ""
  echo "  Likely causes:"
  echo "    1. Stale build (most common): rebuild, then re-run env-verify"
  echo "    2. .env.$MODE.local overriding .env.$MODE with a different value"
  exit 1
fi

if [ "$BOOL_FLAG" -gt 0 ]; then
  echo ""
  echo "BOOLEAN keys present (Vite DCE makes grep unreliable):"
  printf '%s' "$BOOL_LIST"
  echo "  These pass IFF the staleness pre-check passed, which guarantees the"
  echo "  bundle was built from the current .env. If you just flipped a flag,"
  echo "  rebuild before deploying."
fi

exit 0
