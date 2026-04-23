#!/bin/bash
# env-duplicate-check.sh
# Warn when the same key exists in sibling .env* files with differing values.
# Invoked by PostToolUse hook after editing a .env* file.

set -u
FILE="${1:-}"
[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0

case "$(basename "$FILE")" in
  *.bak.*) exit 0 ;;
  .env|.env.*) ;;
  *) exit 0 ;;
esac

DIR="$(dirname "$FILE")"
BASE="$(basename "$FILE")"

SIBLINGS=$(find "$DIR" -maxdepth 1 -type f \( -name ".env" -o -name ".env.*" \) ! -name "*.bak.*" ! -name "$BASE" 2>/dev/null)
[ -z "$SIBLINGS" ] && exit 0

KEYS=$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$FILE" 2>/dev/null | cut -d= -f1 | sort -u)
[ -z "$KEYS" ] && exit 0

WARNINGS=""
while IFS= read -r key; do
  [ -z "$key" ] && continue
  edited_val=$(grep -E "^${key}=" "$FILE" | head -1 | cut -d= -f2-)
  for sibling in $SIBLINGS; do
    if grep -qE "^${key}=" "$sibling" 2>/dev/null; then
      sibling_val=$(grep -E "^${key}=" "$sibling" | head -1 | cut -d= -f2-)
      if [ "$edited_val" != "$sibling_val" ]; then
        WARNINGS="${WARNINGS}  - ${key}: ${BASE}='${edited_val}' vs $(basename "$sibling")='${sibling_val}'"$'\n'
      fi
    fi
  done
done <<< "$KEYS"

if [ -n "$WARNINGS" ]; then
  MSG="[env-duplicate-check] Keys with differing values across sibling .env files in ${DIR}:"$'\n'"${WARNINGS}"$'\n'"Note: .env.local overrides .env; verify your edit takes effect at runtime."
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg msg "$MSG" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $msg}}'
  else
    echo "$MSG" >&2
  fi
fi
exit 0
