#!/usr/bin/env bash
# Guard against known activity_points anti-patterns that hit the 30s
# statement_timeout once the table exceeds ~10M rows. See memory:
# feedback_activity_points_index_usage.md
#
# Two repeated incidents (2026-05-23):
#   - staking-principal-sync: unfiltered DISTINCT ON (identity_id)
#   - lp-position-sync     : unfiltered DISTINCT ON (wallet_address)
#
# Scope: only template-literal SQL blocks (backtick-delimited) referencing
# `activity_points`. JSDoc /* */ blocks and // line comments are skipped
# so inline-code backticks in prose don't trip the check.

set -euo pipefail
cd "$(dirname "$0")/.."

scan_file() {
  awk '
    FNR==1 { inblock=0; block=""; blockstart=0; incomment=0 }
    {
      line = $0
      # Strip JSDoc/block-comment regions so backticks inside prose are ignored.
      out = ""; i = 1; len = length(line)
      while (i <= len) {
        if (incomment) {
          end = index(substr(line, i), "*/")
          if (end == 0) { i = len + 1 }
          else { i = i + end + 1; incomment = 0 }
        } else {
          start = index(substr(line, i), "/*")
          lc    = index(substr(line, i), "//")
          if (lc > 0 && (start == 0 || lc < start)) {
            out = out substr(line, i, lc - 1)
            i = len + 1
          } else if (start > 0) {
            out = out substr(line, i, start - 1)
            i = i + start + 1
            incomment = 1
          } else {
            out = out substr(line, i)
            i = len + 1
          }
        }
      }
      rest = out
      while (length(rest) > 0) {
        pos = index(rest, "`")
        if (pos == 0) {
          if (inblock) block = block "\n" rest
          break
        }
        seg = substr(rest, 1, pos - 1)
        if (inblock) {
          block = block "\n" seg
          if (block ~ /activity_points/) {
            bad = ""
            if (block ~ /DISTINCT ON/ && block !~ /= ANY\(/) bad = bad " distinct-on-unfiltered"
            if (block ~ /LOWER\([[:space:]]*wallet/)         bad = bad " lower-wallet"
            if (block ~ /ORDER BY[^;]*processed_at/)         bad = bad " order-by-processed-at"
            if (bad != "") print FILENAME ":" blockstart ":" bad
          }
          inblock = 0; block = ""
        } else {
          inblock = 1; blockstart = FNR; block = ""
        }
        rest = substr(rest, pos + 1)
      }
    }
  ' "$1"
}

violations=""
while IFS= read -r -d '' f; do
  out=$(scan_file "$f" || true)
  [[ -n "$out" ]] && violations+="$out"$'\n'
done < <(find src -name '*.ts' -print0)

if [[ -n "${violations// /}" ]]; then
  printf '%s' "$violations"
  echo
  echo "activity_points SQL anti-pattern detected."
  echo "  See memory: feedback_activity_points_index_usage.md"
  echo "  Use scanner/identity-wallet.ts#getLatestWalletPerIdentity for full-identity scans,"
  echo "  or filter via WHERE wallet_address = ANY(\${smallSet})."
  exit 1
fi
echo "ok"
