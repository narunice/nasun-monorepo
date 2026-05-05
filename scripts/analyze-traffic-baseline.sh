#!/bin/bash
# ==============================================================================
# A1 mini-baseline: prod nginx access log을 분석해서 cap 산정 데이터 산출.
#
# Computes:
#   - IP별 5min sliding window 최대 RPS의 95p / 99p / max
#   - $host 필드별 분포 (5/5 02:00 UTC 이후 데이터만 의미)
#   - top requesting IPs (봇/스캐너 후보)
#   - top URLs by host
#
# Usage: ./scripts/analyze-traffic-baseline.sh [hours_back]
#   default: 24 hours back from now
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/_common.sh"

PROD_HOST="ec2-user@43.200.67.52"
SSH_KEY="$HOME/.ssh/.awskey/nasun-prod-key"
SSH_OPTS="-i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no"
HOURS="${1:-24}"

OUT_DIR="$REPO_ROOT/_backup/incident-2026-05-04-05/baseline-$(date +%Y%m%d-%H%M)"
mkdir -p "$OUT_DIR"

log_info "Analyzing last $HOURS hours of prod access log → $OUT_DIR"

# Run analysis on prod (avoid downloading multi-GB log).
# Pull only the aggregated results.
ALLOW_PROD_DIRECT=1 ssh $SSH_OPTS "$PROD_HOST" "bash -s" "$HOURS" > "$OUT_DIR/raw-output.txt" 2>&1 << 'REMOTE'
HOURS_BACK=$1
SINCE=$(date -u -d "$HOURS_BACK hours ago" "+%Y-%m-%dT%H:%M:%S")
SINCE_LOG=$(date -u -d "$HOURS_BACK hours ago" "+%d/%b/%Y:%H")
echo "=== Window: last $HOURS_BACK hours (since $SINCE UTC) ==="
echo ""

# Use both rotated and current log.
LOG_INPUT="/var/log/nginx/access.log"
[ -f /var/log/nginx/access.log.1 ] && LOG_INPUT="/var/log/nginx/access.log.1 $LOG_INPUT"

# Filter to time window.
sudo cat $LOG_INPUT 2>/dev/null | awk -v since="$SINCE_LOG" '
{
  # $4 = [05/May/2026:HH:MM:SS
  ts = substr($4, 2, 17)
  if (ts >= since) print
}' > /tmp/baseline_window.log
TOTAL_LINES=$(wc -l < /tmp/baseline_window.log)
echo "Total requests in window: $TOTAL_LINES"
echo ""

# 1. IP별 5min sliding window 최대 RPS
echo "=== 1. IP-level 5min max RPS distribution ==="
awk '{
  # $4 = [05/May/2026:HH:MM:SS
  ts = substr($4, 14, 5)
  split(ts, t, ":")
  # 5-min bucket: HH:floor(MM/5)*5, plus date prefix to handle multi-day
  date = substr($4, 2, 11)
  bucket = date " " t[1] ":" sprintf("%02d", int(t[2]/5)*5)
  print $1 "|" bucket
}' /tmp/baseline_window.log | sort | uniq -c | awk '{
  count = $1
  ipbucket = substr($0, index($0, " ") + 1)
  split(ipbucket, parts, "|")
  ip = parts[1]
  if (count > max_rps[ip]) max_rps[ip] = count
}
END {
  n = 0
  for (ip in max_rps) {
    n++
    rps[n] = max_rps[ip]
    ip_arr[n] = ip
  }
  # sort rps array ascending using bubble (small data)
  for (i=1; i<=n; i++) for (j=i+1; j<=n; j++) if (rps[j] < rps[i]) {tmp=rps[i]; rps[i]=rps[j]; rps[j]=tmp}
  if (n == 0) {print "  (no data)"; exit}
  printf "  Total unique IPs: %d\n", n
  printf "  Max single-IP 5min RPS: %d\n", rps[n]
  printf "  99p: %d\n", rps[int(n*0.99) + (int(n*0.99) < n)]
  printf "  95p: %d\n", rps[int(n*0.95) + (int(n*0.95) < n)]
  printf "  90p: %d\n", rps[int(n*0.90) + (int(n*0.90) < n)]
  printf "  50p (median): %d\n", rps[int(n*0.50) + (int(n*0.50) < n)]
}'
echo ""

# 2. Top 10 IPs by 5min max RPS
echo "=== 2. Top 10 IPs by 5min max RPS (potential bots / heavy users) ==="
awk '{
  ts = substr($4, 14, 5)
  split(ts, t, ":")
  date = substr($4, 2, 11)
  bucket = date " " t[1] ":" sprintf("%02d", int(t[2]/5)*5)
  print $1 "|" bucket
}' /tmp/baseline_window.log | sort | uniq -c | awk '{
  count = $1
  ipbucket = substr($0, index($0, " ") + 1)
  split(ipbucket, parts, "|")
  ip = parts[1]
  if (count > max_rps[ip]) {max_rps[ip] = count; max_bucket[ip] = parts[2]}
}
END {
  for (ip in max_rps) printf "%d %s @%s\n", max_rps[ip], ip, max_bucket[ip]
}' | sort -rn | head -10
echo ""

# 3. $host distribution (only meaningful for log entries with $host field)
echo "=== 3. Host distribution (only entries with \$host field, since 5/5 02:00 UTC) ==="
# $host is the LAST quoted field in the new log_format
awk -F'"' 'NF >= 7 && $(NF-1) ~ /^[a-z0-9.-]+$/ {print $(NF-1)}' /tmp/baseline_window.log | sort | uniq -c | sort -rn | head -20
echo ""

# 4. Per-host top URLs (since 5/5 02:00 UTC entries only)
echo "=== 4. Per-host top URLs (helps identify SPA fan-out endpoints) ==="
for host in nasun.io explorer.nasun.io pado.finance; do
  echo "--- $host (top 15 URLs) ---"
  awk -F'"' -v h="$host" 'NF >= 7 && $(NF-1) == h {print $2}' /tmp/baseline_window.log | awk '{print $2}' | awk -F? '{print $1}' | sort | uniq -c | sort -rn | head -15
  echo ""
done

# 5. Per-host single-IP 5min max RPS (host-specific cap 산정용)
echo "=== 5. Per-host single-IP 5min max RPS (for host scope-down decision) ==="
for host in nasun.io explorer.nasun.io pado.finance; do
  echo "--- $host ---"
  awk -F'"' -v h="$host" 'NF >= 7 && $(NF-1) == h {
    # $1 contains "ip - - [...]" — split first
    n = split($1, parts, " ")
    ip = parts[1]
    ts = substr(parts[4], 14, 5)
    split(ts, t, ":")
    date = substr(parts[4], 2, 11)
    bucket = date " " t[1] ":" sprintf("%02d", int(t[2]/5)*5)
    print ip "|" bucket
  }' /tmp/baseline_window.log | sort | uniq -c | awk '{
    count = $1
    ipbucket = substr($0, index($0, " ") + 1)
    split(ipbucket, parts, "|")
    ip = parts[1]
    if (count > max_rps[ip]) max_rps[ip] = count
  }
  END {
    n = 0
    for (ip in max_rps) {n++; rps[n] = max_rps[ip]}
    for (i=1; i<=n; i++) for (j=i+1; j<=n; j++) if (rps[j] < rps[i]) {tmp=rps[i]; rps[i]=rps[j]; rps[j]=tmp}
    if (n == 0) {print "  (no data with $host field yet)"; exit}
    printf "  Unique IPs: %d, max: %d, 99p: %d, 95p: %d, 90p: %d\n", n, rps[n], rps[int(n*0.99) + (int(n*0.99) < n)], rps[int(n*0.95) + (int(n*0.95) < n)], rps[int(n*0.90) + (int(n*0.90) < n)]
  }'
done

rm -f /tmp/baseline_window.log
REMOTE

echo ""
log_success "Output saved to $OUT_DIR/raw-output.txt"
echo ""
cat "$OUT_DIR/raw-output.txt"
