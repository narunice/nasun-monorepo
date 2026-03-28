#!/usr/bin/env bash
# Number Match Admin + Gameplay E2E Test Suite
# Tests admin operations (fund, withdraw, pause, unpause, emergency) and
# verifies gameplay correctly interacts with admin state.
#
# Usage: bash test-admin-e2e.sh

set -euo pipefail

SUI="<NASUN_DEVNET>/sui/target/release/sui"
RPC="https://rpc.devnet.nasun.io"
PACKAGE="0xf1087293200f23afdcce3415fcf025943bb22708b6b29588be671629dcb92758"
POOL="0x5c13493b078a5dc412b1fd7bd213d287848d8acbf5f01b14ae134fd047d94b28"
ADMIN_CAP="0x74d2541b7769d71b9075090e05113c489ed902cb176672a8d83a5140a862f89a"
NUSDC_TYPE="0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC"

PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo -e "  ${GREEN}PASS${NC} $1"; }
log_fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo -e "  ${RED}FAIL${NC} $1"; }
log_info() { echo -e "  ${YELLOW}INFO${NC} $1"; }

# ===== Helper functions =====

get_pool_field() {
  local field="$1"
  curl -s "$RPC" -X POST -H 'Content-Type: application/json' -d "{
    \"jsonrpc\": \"2.0\", \"id\": 1,
    \"method\": \"sui_getObject\",
    \"params\": [\"$POOL\", {\"showContent\": true}]
  }" | python3 -c "
import json, sys
data = json.load(sys.stdin)
fields = data['result']['data']['content']['fields']
print(fields['$field'])
"
}

get_pool_balance() { get_pool_field "pool"; }
get_pool_paused() { get_pool_field "is_paused"; }
get_pool_total_plays() { get_pool_field "total_plays"; }
get_pool_daily_count() { get_pool_field "daily_play_count"; }

find_nusdc_coin() {
  local min_balance=$1
  curl -s "$RPC" -X POST -H 'Content-Type: application/json' -d "{
    \"jsonrpc\": \"2.0\", \"id\": 1,
    \"method\": \"suix_getCoins\",
    \"params\": [\"$($SUI client active-address)\", \"$NUSDC_TYPE\"]
  }" | python3 -c "
import json, sys
data = json.load(sys.stdin)
coins = data.get('result', {}).get('data', [])
for c in coins:
    if int(c.get('balance', '0')) >= $min_balance:
        print(c['coinObjectId'])
        break
"
}

# Admin call helper: returns "success" or "failure:reason"
admin_call() {
  local func="$1"
  shift
  local result
  result=$($SUI client call \
    --package "$PACKAGE" \
    --module numbermatch \
    --function "$func" \
    --args $@ \
    --gas-budget 10000000 \
    --json 2>&1) || true

  echo "$result" | python3 -c "
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
    status = data.get('effects', {}).get('status', {})
    if status.get('status') == 'success':
        print('success')
    else:
        err = status.get('error', 'unknown')
        print(f'failure:{err}')
except (json.JSONDecodeError, KeyError):
    if 'Error' in raw or 'abort' in raw:
        print('failure:cli_error')
    else:
        print('error:parse_failed')
" 2>/dev/null
}

# Play game helper: returns "success:win/loss:payout" or "failure:reason"
play_game() {
  local picks_csv="$1"
  local num_picks
  num_picks=$(echo "$picks_csv" | tr ',' ' ' | wc -w)
  local cost=$((num_picks * 5000000))

  local nusdc_coin
  nusdc_coin=$(find_nusdc_coin $cost)
  if [[ -z "$nusdc_coin" ]]; then
    echo "error:no_nusdc"
    return
  fi

  local result
  result=$($SUI client ptb \
    --split-coins "@${nusdc_coin}" "[$cost]" \
    --assign payment \
    --make-move-vec "<u8>" "[$picks_csv]" \
    --assign picks \
    --move-call "${PACKAGE}::numbermatch::play_game" \
      "@${POOL}" payment picks "@0x8" "@0x6" \
    --gas-budget 50000000 \
    --json 2>&1) || true

  echo "$result" | python3 -c "
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
    status = data.get('effects', {}).get('status', {})
    if status.get('status') != 'success':
        err = status.get('error', 'unknown')
        print(f'failure:{err}')
    else:
        events = data.get('events', [])
        found = False
        for e in events:
            if 'NumberMatchPlayed' in e.get('type', ''):
                pj = e['parsedJson']
                win = 'win' if pj['is_win'] else 'loss'
                print(f'success:{win}:{pj[\"payout\"]}')
                found = True
                break
        if not found:
            print('failure:no_event')
except (json.JSONDecodeError, KeyError):
    # Non-JSON output (CLI error message)
    if 'Error' in raw or 'abort' in raw or 'error' in raw.lower():
        print('failure:cli_error')
    else:
        print(f'error:parse_failed')
" 2>/dev/null
}

echo "============================================"
echo " Number Match Admin E2E Test Suite"
echo " Network: Nasun Devnet"
echo "============================================"
echo ""

# ===== Pre-check =====
echo "[Pre-check] Current Pool State"
bal=$(get_pool_balance)
paused=$(get_pool_paused)
plays=$(get_pool_total_plays)
echo "  Balance: $((bal / 1000000)) NUSDC, Paused: $paused, Total plays: $plays"
echo ""

# ===== Group 1: Pool state reading =====
echo "[Group 1] Pool state reading"

if [[ $bal -gt 0 ]]; then
  log_pass "Pool balance is positive ($((bal / 1000000)) NUSDC)"
else
  log_fail "Pool balance is zero or negative"
fi

if [[ "$paused" == "False" || "$paused" == "false" ]]; then
  log_pass "Pool is active (not paused)"
else
  log_info "Pool is paused -- will unpause for tests"
  admin_call "set_paused" "$ADMIN_CAP" "$POOL" false > /dev/null
  sleep 1
fi
echo ""

# ===== Group 2: Pause / Unpause =====
echo "[Group 2] Pause / Unpause"

# Pause the game
res=$(admin_call "set_paused" "$ADMIN_CAP" "$POOL" true)
sleep 1
if [[ "$res" == "success" ]]; then
  paused_state=$(get_pool_paused)
  if [[ "$paused_state" == "True" || "$paused_state" == "true" ]]; then
    log_pass "Pause: pool is now paused"
  else
    log_fail "Pause: transaction succeeded but pool not paused (state=$paused_state)"
  fi
else
  log_fail "Pause: transaction failed ($res)"
fi

# Try to play while paused (should fail)
play_res=$(play_game "3")
if echo "$play_res" | grep -q "failure"; then
  log_pass "Play while paused: correctly rejected"
else
  log_fail "Play while paused: should have been rejected but got: $play_res"
fi

# Unpause
res=$(admin_call "set_paused" "$ADMIN_CAP" "$POOL" false)
sleep 1
if [[ "$res" == "success" ]]; then
  paused_state=$(get_pool_paused)
  if [[ "$paused_state" == "False" || "$paused_state" == "false" ]]; then
    log_pass "Unpause: pool is now active"
  else
    log_fail "Unpause: transaction succeeded but pool still paused"
  fi
else
  log_fail "Unpause: transaction failed ($res)"
fi

# Play after unpause (should succeed)
play_res=$(play_game "3")
if echo "$play_res" | grep -q "success"; then
  log_pass "Play after unpause: works correctly ($play_res)"
else
  log_fail "Play after unpause: failed ($play_res)"
fi
echo ""

# ===== Group 3: Fund Pool =====
echo "[Group 3] Fund Pool"

bal_before=$(get_pool_balance)
fund_coin=$(find_nusdc_coin 5000000)  # Find a coin >= 5 NUSDC

if [[ -n "$fund_coin" ]]; then
  # Get the coin's exact balance for verification
  coin_balance=$(curl -s "$RPC" -X POST -H 'Content-Type: application/json' -d "{
    \"jsonrpc\": \"2.0\", \"id\": 1,
    \"method\": \"sui_getObject\",
    \"params\": [\"$fund_coin\", {\"showContent\": true}]
  }" | python3 -c "
import json, sys
data = json.load(sys.stdin)
fields = data['result']['data']['content']['fields']
print(fields.get('balance', '0'))
")

  res=$(admin_call "fund_pool" "$ADMIN_CAP" "$POOL" "$fund_coin")
  sleep 1

  if [[ "$res" == "success" ]]; then
    bal_after=$(get_pool_balance)
    expected=$((bal_before + coin_balance))
    if [[ $bal_after -eq $expected ]]; then
      log_pass "Fund pool: balance increased by $((coin_balance / 1000000)) NUSDC (before=$((bal_before/1000000)), after=$((bal_after/1000000)))"
    else
      log_fail "Fund pool: balance mismatch (expected=$((expected/1000000)), got=$((bal_after/1000000)))"
    fi
  else
    log_fail "Fund pool: transaction failed ($res)"
  fi
else
  log_info "Fund pool: skipped (no NUSDC coin >= 5 NUSDC found)"
fi
echo ""

# ===== Group 4: Withdraw Pool =====
echo "[Group 4] Withdraw Pool"

bal_before=$(get_pool_balance)

# Withdraw 1 NUSDC (should succeed if pool > POOL_MIN_BALANCE + 1)
res=$($SUI client call \
  --package "$PACKAGE" \
  --module numbermatch \
  --function withdraw_pool \
  --args "$ADMIN_CAP" "$POOL" "1000000" \
  --gas-budget 10000000 \
  --json 2>&1 | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    s = data.get('effects',{}).get('status',{}).get('status','unknown')
    print(s)
except:
    print('error')
" 2>/dev/null)
sleep 1

if [[ "$res" == "success" ]]; then
  bal_after=$(get_pool_balance)
  expected=$((bal_before - 1000000))
  if [[ $bal_after -eq $expected ]]; then
    log_pass "Withdraw 1 NUSDC: balance decreased correctly ($((bal_before/1000000)) -> $((bal_after/1000000)))"
  else
    log_fail "Withdraw 1 NUSDC: balance mismatch (expected=$((expected/1000000)), got=$((bal_after/1000000)))"
  fi
else
  log_fail "Withdraw 1 NUSDC: transaction failed ($res)"
fi

# Try to withdraw more than allowed (pool - amount < POOL_MIN_BALANCE=500 NUSDC)
bal_current=$(get_pool_balance)
# Try to withdraw everything (should fail because pool must keep >= 500 NUSDC)
# Would leave 499 NUSDC < 500 min
withdraw_too_much=$(python3 -c "print(max(0, $bal_current - 499000000))")
if [[ "$withdraw_too_much" != "0" ]]; then
  tmpfile=$(mktemp)
  timeout 30 $SUI client call \
    --package "$PACKAGE" \
    --module numbermatch \
    --function withdraw_pool \
    --args "$ADMIN_CAP" "$POOL" "$withdraw_too_much" \
    --gas-budget 10000000 \
    --json > "$tmpfile" 2>&1 || true
  sleep 1

  res=$(python3 -c "
import json, sys
with open('$tmpfile') as f:
    raw = f.read()
try:
    data = json.loads(raw)
    s = data.get('effects',{}).get('status',{})
    print('failure' if s.get('status') == 'failure' else s.get('status','unknown'))
except:
    print('failure' if ('Error' in raw or 'abort' in raw) else 'error')
" 2>/dev/null)
  rm -f "$tmpfile"

  if [[ "$res" == "failure" ]]; then
    log_pass "Withdraw below min balance: correctly rejected (would leave < 500 NUSDC)"
  else
    log_fail "Withdraw below min balance: should have been rejected but got: $res"
  fi
else
  log_info "Withdraw below min balance: skipped (pool too low to test)"
fi
echo ""

# ===== Group 5: Gameplay with pool changes =====
echo "[Group 5] Gameplay after admin operations"

bal_before=$(get_pool_balance)
plays_before=$(get_pool_total_plays)

# Play 3 games with different pick counts
for picks in "1" "2, 4" "1, 3, 5"; do
  play_res=$(play_game "$picks")
  if echo "$play_res" | grep -q "success"; then
    log_pass "Play [$picks]: $play_res"
  else
    log_fail "Play [$picks]: $play_res"
  fi
done
sleep 1

plays_after=$(get_pool_total_plays)
plays_diff=$((plays_after - plays_before))
if [[ $plays_diff -eq 3 ]]; then
  log_pass "Total plays incremented by 3 (before=$plays_before, after=$plays_after)"
else
  log_fail "Total plays increment wrong: expected +3, got +$plays_diff"
fi
echo ""

# ===== Group 6: Emergency Withdraw =====
echo "[Group 6] Emergency Withdraw"

bal_before=$(get_pool_balance)

# Emergency withdraw should drain pool and auto-pause
res=$(admin_call "emergency_withdraw_all" "$ADMIN_CAP" "$POOL")
sleep 1

if [[ "$res" == "success" ]]; then
  bal_after=$(get_pool_balance)
  paused_after=$(get_pool_paused)

  if [[ $bal_after -eq 0 ]]; then
    log_pass "Emergency withdraw: pool drained to 0 (was $((bal_before/1000000)) NUSDC)"
  else
    log_fail "Emergency withdraw: pool not fully drained ($((bal_after/1000000)) NUSDC remaining)"
  fi

  if [[ "$paused_after" == "True" || "$paused_after" == "true" ]]; then
    log_pass "Emergency withdraw: auto-paused"
  else
    log_fail "Emergency withdraw: pool not paused after emergency"
  fi
else
  log_fail "Emergency withdraw: transaction failed ($res)"
fi

# Try to play after emergency (should fail: paused + no funds)
play_res=$(play_game "3")
if echo "$play_res" | grep -q "failure\|error"; then
  log_pass "Play after emergency: correctly rejected"
else
  log_fail "Play after emergency: should have been rejected but got: $play_res"
fi
echo ""

# ===== Group 7: Recovery after emergency =====
echo "[Group 7] Recovery (re-fund + unpause)"

# Find a coin to re-fund
refund_coin=$(find_nusdc_coin 500000000)  # Need >= 500 NUSDC (min balance)
if [[ -n "$refund_coin" ]]; then
  res=$(admin_call "fund_pool" "$ADMIN_CAP" "$POOL" "$refund_coin")
  sleep 1
  if [[ "$res" == "success" ]]; then
    bal_after=$(get_pool_balance)
    log_pass "Re-fund: pool now has $((bal_after/1000000)) NUSDC"
  else
    log_fail "Re-fund: failed ($res)"
  fi
else
  log_fail "Re-fund: no NUSDC coin >= 500 NUSDC found"
fi

# Unpause
res=$(admin_call "set_paused" "$ADMIN_CAP" "$POOL" false)
sleep 1
if [[ "$res" == "success" ]]; then
  log_pass "Unpause after recovery: success"
else
  log_fail "Unpause after recovery: failed ($res)"
fi

# Verify gameplay works again
play_res=$(play_game "2, 5")
if echo "$play_res" | grep -q "success"; then
  log_pass "Play after recovery: works ($play_res)"
else
  log_fail "Play after recovery: failed ($play_res)"
fi
echo ""

# ===== Group 8: Double pause / unpause idempotency =====
echo "[Group 8] Idempotency"

# Pause twice
admin_call "set_paused" "$ADMIN_CAP" "$POOL" true > /dev/null
sleep 1
res=$(admin_call "set_paused" "$ADMIN_CAP" "$POOL" true)
if [[ "$res" == "success" ]]; then
  log_pass "Double pause: idempotent (no error)"
else
  log_fail "Double pause: failed ($res)"
fi

# Unpause twice
admin_call "set_paused" "$ADMIN_CAP" "$POOL" false > /dev/null
sleep 1
res=$(admin_call "set_paused" "$ADMIN_CAP" "$POOL" false)
if [[ "$res" == "success" ]]; then
  log_pass "Double unpause: idempotent (no error)"
else
  log_fail "Double unpause: failed ($res)"
fi
echo ""

# ===== Group 9: Emergency on empty pool =====
echo "[Group 9] Edge case: emergency on low-balance pool"

# Emergency withdraw on an already-funded pool (not empty)
# This should succeed and leave pool at 0
# First check current state is active
paused=$(get_pool_paused)
if [[ "$paused" == "True" || "$paused" == "true" ]]; then
  admin_call "set_paused" "$ADMIN_CAP" "$POOL" false > /dev/null
  sleep 1
fi

# Do emergency
res=$(admin_call "emergency_withdraw_all" "$ADMIN_CAP" "$POOL")
sleep 1
if [[ "$res" == "success" ]]; then
  log_pass "Emergency on funded pool: success"
else
  log_fail "Emergency on funded pool: failed ($res)"
fi

# Try emergency again on empty pool (should still succeed, just 0 withdraw)
res=$(admin_call "emergency_withdraw_all" "$ADMIN_CAP" "$POOL")
sleep 1
if [[ "$res" == "success" ]]; then
  bal=$(get_pool_balance)
  if [[ $bal -eq 0 ]]; then
    log_pass "Emergency on empty pool: idempotent (balance still 0)"
  else
    log_fail "Emergency on empty pool: balance not 0 ($bal)"
  fi
else
  log_fail "Emergency on empty pool: failed ($res)"
fi
echo ""

# ===== Restore: re-fund and unpause for future use =====
echo "[Restore] Re-funding pool for future use"
restore_coin=$(find_nusdc_coin 1000000000)  # >= 1000 NUSDC
if [[ -n "$restore_coin" ]]; then
  admin_call "fund_pool" "$ADMIN_CAP" "$POOL" "$restore_coin" > /dev/null
  sleep 1
fi
admin_call "set_paused" "$ADMIN_CAP" "$POOL" false > /dev/null
sleep 1
final_bal=$(get_pool_balance)
final_paused=$(get_pool_paused)
echo "  Final state: $((final_bal/1000000)) NUSDC, Paused: $final_paused"
echo ""

# ===== Summary =====
echo "============================================"
echo " RESULTS"
echo "============================================"
echo "  Total tests: $TOTAL"
echo -e "  Passed:      ${GREEN}${PASS}${NC}"
if [[ $FAIL -gt 0 ]]; then
  echo -e "  Failed:      ${RED}${FAIL}${NC}"
else
  echo -e "  Failed:      ${GREEN}0${NC}"
fi
echo "============================================"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
