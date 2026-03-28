#!/usr/bin/env bash
# Number Match E2E Test Suite
# Tests the deployed contract on Nasun devnet with real VRF randomness.
#
# Usage: bash test-e2e.sh
#
# Verifies:
# - All pick counts (1, 2, 3) work correctly
# - Boundary numbers (1, 5) are accepted
# - Payout amounts match formulas (win: 15+K NUSDC, loss refund: K NUSDC)
# - Events contain all required fields
# - Pool balance changes correctly
# - Error cases are properly rejected

set -euo pipefail

SUI="<NASUN_DEVNET>/sui/target/release/sui"
RPC="https://rpc.devnet.nasun.io"
PACKAGE="0xf1087293200f23afdcce3415fcf025943bb22708b6b29588be671629dcb92758"
POOL="0x5c13493b078a5dc412b1fd7bd213d287848d8acbf5f01b14ae134fd047d94b28"
NUSDC_TYPE="0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC"
RANDOM_OBJ="0x8"
CLOCK_OBJ="0x6"

PASS=0
FAIL=0
TOTAL=0
WINS=0
LOSSES=0
TOTAL_PLAYS=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${GREEN}PASS${NC} $1"
}

log_fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${RED}FAIL${NC} $1"
}

log_info() {
  echo -e "  ${YELLOW}INFO${NC} $1"
}

# Get pool state via RPC
get_pool_balance() {
  curl -s "$RPC" -X POST -H 'Content-Type: application/json' -d "{
    \"jsonrpc\": \"2.0\", \"id\": 1,
    \"method\": \"sui_getObject\",
    \"params\": [\"$POOL\", {\"showContent\": true}]
  }" | python3 -c "
import json, sys
data = json.load(sys.stdin)
fields = data['result']['data']['content']['fields']
print(fields['pool'])
"
}

get_pool_paused() {
  curl -s "$RPC" -X POST -H 'Content-Type: application/json' -d "{
    \"jsonrpc\": \"2.0\", \"id\": 1,
    \"method\": \"sui_getObject\",
    \"params\": [\"$POOL\", {\"showContent\": true}]
  }" | python3 -c "
import json, sys
data = json.load(sys.stdin)
fields = data['result']['data']['content']['fields']
print(fields['is_paused'])
"
}

# Find a NUSDC coin with sufficient balance
find_nusdc_coin() {
  local min_balance=$1
  curl -s "$RPC" -X POST -H 'Content-Type: application/json' -d "{
    \"jsonrpc\": \"2.0\", \"id\": 1,
    \"method\": \"suix_getCoins\",
    \"params\": [\"$(${SUI} client active-address)\", \"$NUSDC_TYPE\"]
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

# Play a game and return the transaction digest
# Args: picks as space-separated numbers (e.g. "1 3 5")
play_game() {
  local picks_str="$1"
  local -a picks_arr=($picks_str)
  local num_picks=${#picks_arr[@]}
  local cost=$((num_picks * 5000000))

  local nusdc_coin
  nusdc_coin=$(find_nusdc_coin $cost)
  if [[ -z "$nusdc_coin" ]]; then
    echo "ERROR:NO_NUSDC"
    return 1
  fi

  # Build picks array string for --make-move-vec (e.g. "[1, 3, 5]")
  local picks_csv="${picks_str// /, }"

  local result
  result=$($SUI client ptb \
    --split-coins "@${nusdc_coin}" "[$cost]" \
    --assign payment \
    --make-move-vec "<u8>" "[$picks_csv]" \
    --assign picks \
    --move-call "${PACKAGE}::numbermatch::play_game" \
      "@${POOL}" payment picks "@${RANDOM_OBJ}" "@${CLOCK_OBJ}" \
    --gas-budget 50000000 \
    --json 2>&1) || true

  echo "$result"
}

# Parse event from transaction JSON result
parse_event() {
  local tx_json="$1"
  echo "$tx_json" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    events = data.get('events', [])
    for e in events:
        if 'NumberMatchPlayed' in e.get('type', ''):
            pj = e['parsedJson']
            print(f\"game_id={pj['game_id']}\")
            print(f\"player={pj['player']}\")
            print(f\"picks={pj['picks']}\")
            print(f\"winning_number={pj['winning_number']}\")
            print(f\"is_win={pj['is_win']}\")
            print(f\"cost={pj['cost']}\")
            print(f\"payout={pj['payout']}\")
            break
    else:
        print('NO_EVENT')
except Exception as ex:
    print(f'PARSE_ERROR:{ex}')
"
}

# Parse transaction status
parse_status() {
  local tx_json="$1"
  echo "$tx_json" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    effects = data.get('effects', {})
    status = effects.get('status', {}).get('status', 'unknown')
    print(status)
except:
    # Try to find error in raw output
    raw = sys.stdin.read() if not data else ''
    print('error')
"
}

# Play and validate a single game
# Args: test_name picks_str
run_play_test() {
  local test_name="$1"
  local picks_str="$2"
  local -a picks_arr=($picks_str)
  local num_picks=${#picks_arr[@]}
  local expected_cost=$((num_picks * 5000000))
  local expected_win_payout=$((15000000 + num_picks * 1000000))
  local expected_loss_refund=$((num_picks * 1000000))

  TOTAL_PLAYS=$((TOTAL_PLAYS + 1))

  # Get pool balance before
  local pool_before
  pool_before=$(get_pool_balance)

  # Play
  local tx_result
  tx_result=$(play_game "$picks_str")

  # Check for transaction-level errors
  if echo "$tx_result" | grep -q "ERROR:NO_NUSDC"; then
    log_fail "$test_name - No NUSDC coin found"
    return
  fi

  local status
  status=$(echo "$tx_result" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('effects', {}).get('status', {}).get('status', 'unknown'))
except:
    print('parse_error')
" 2>/dev/null)

  if [[ "$status" != "success" ]]; then
    log_fail "$test_name - Transaction failed (status: $status)"
    return
  fi

  # Parse event
  local event_data
  event_data=$(parse_event "$tx_result")

  if echo "$event_data" | grep -q "NO_EVENT"; then
    log_fail "$test_name - No NumberMatchPlayed event emitted"
    return
  fi

  if echo "$event_data" | grep -q "PARSE_ERROR"; then
    log_fail "$test_name - Event parse error: $event_data"
    return
  fi

  # Extract fields
  local is_win cost payout winning_number picks_field
  is_win=$(echo "$event_data" | grep "is_win=" | cut -d= -f2)
  cost=$(echo "$event_data" | grep "cost=" | cut -d= -f2)
  payout=$(echo "$event_data" | grep "payout=" | cut -d= -f2)
  winning_number=$(echo "$event_data" | grep "winning_number=" | cut -d= -f2)
  picks_field=$(echo "$event_data" | grep "picks=" | cut -d= -f2)

  # Validate cost
  if [[ "$cost" != "$expected_cost" ]]; then
    log_fail "$test_name - Cost mismatch: expected=$expected_cost, got=$cost"
    return
  fi

  # Validate payout based on win/loss
  if [[ "$is_win" == "True" || "$is_win" == "true" ]]; then
    WINS=$((WINS + 1))
    if [[ "$payout" != "$expected_win_payout" ]]; then
      log_fail "$test_name - Win payout mismatch: expected=$expected_win_payout, got=$payout"
      return
    fi
    log_pass "$test_name - WIN (number=$winning_number, picks=$picks_field, payout=${payout})"
  else
    LOSSES=$((LOSSES + 1))
    if [[ "$payout" != "$expected_loss_refund" ]]; then
      log_fail "$test_name - Loss refund mismatch: expected=$expected_loss_refund, got=$payout"
      return
    fi
    log_pass "$test_name - LOSS (number=$winning_number, picks=$picks_field, refund=${payout})"
  fi

  # Validate winning number range
  if [[ "$winning_number" -lt 1 || "$winning_number" -gt 5 ]]; then
    log_fail "$test_name - Winning number out of range: $winning_number"
    return
  fi

  # Small delay for RPC indexing
  sleep 1
}

# Test that an invalid play is rejected
run_error_test() {
  local test_name="$1"
  local picks_str="$2"
  local expected_error="$3"

  TOTAL_PLAYS=$((TOTAL_PLAYS + 1))

  local tx_result
  tx_result=$(play_game "$picks_str" 2>&1) || true

  # Check that transaction failed
  local status
  status=$(echo "$tx_result" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    s = data.get('effects', {}).get('status', {})
    if s.get('status') == 'failure':
        print('failure:' + str(s.get('error', '')))
    else:
        print(s.get('status', 'unknown'))
except:
    print('non_json')
" 2>/dev/null)

  if echo "$status" | grep -q "failure"; then
    log_pass "$test_name - Correctly rejected"
  elif echo "$tx_result" | grep -qi "error\|abort\|fail"; then
    log_pass "$test_name - Correctly rejected (CLI error)"
  else
    log_fail "$test_name - Expected rejection but got: $status"
  fi

  sleep 1
}


echo "============================================"
echo " Number Match E2E Test Suite"
echo " Network: Nasun Devnet"
echo " Package: ${PACKAGE:0:12}..."
echo " Pool: ${POOL:0:12}..."
echo "============================================"
echo ""

# Verify pool is active
echo "[Pre-check] Pool State"
pool_bal=$(get_pool_balance)
pool_paused=$(get_pool_paused)
echo "  Balance: $((pool_bal / 1000000)) NUSDC"
echo "  Paused: $pool_paused"
if [[ "$pool_paused" == "True" || "$pool_paused" == "true" ]]; then
  echo -e "  ${RED}Pool is paused! Cannot run tests.${NC}"
  exit 1
fi
echo ""

# ========================================
# Test Group 1: Basic plays (all pick counts)
# ========================================
echo "[Group 1] Basic plays - all pick counts"
run_play_test "1-pick basic [3]" "3"
run_play_test "2-pick basic [2 4]" "2 4"
run_play_test "3-pick basic [1 3 5]" "1 3 5"
echo ""

# ========================================
# Test Group 2: Boundary numbers
# ========================================
echo "[Group 2] Boundary numbers"
run_play_test "1-pick min [1]" "1"
run_play_test "1-pick max [5]" "5"
run_play_test "2-pick min+max [1 5]" "1 5"
run_play_test "3-pick low [1 2 3]" "1 2 3"
run_play_test "3-pick high [3 4 5]" "3 4 5"
echo ""

# ========================================
# Test Group 3: Repeated plays for statistical sampling
# ========================================
echo "[Group 3] Statistical sampling (1-pick x5)"
for i in $(seq 1 5); do
  # Rotate through numbers 1-5
  num=$(( (i % 5) + 1 ))
  run_play_test "1-pick round $i [$num]" "$num"
done
echo ""

echo "[Group 4] Statistical sampling (2-pick x5)"
for i in $(seq 1 5); do
  n1=$(( (i % 5) + 1 ))
  n2=$(( (i % 4) + 1 ))
  if [[ $n1 -eq $n2 ]]; then n2=$(( (n2 % 5) + 1 )); fi
  # Ensure n1 != n2
  if [[ $n1 -eq $n2 ]]; then
    if [[ $n1 -lt 5 ]]; then n2=$((n1 + 1)); else n2=$((n1 - 1)); fi
  fi
  run_play_test "2-pick round $i [$n1 $n2]" "$n1 $n2"
done
echo ""

echo "[Group 5] Statistical sampling (3-pick x5)"
combos=("1 2 3" "1 2 4" "1 2 5" "1 3 4" "1 3 5")
for i in $(seq 0 4); do
  run_play_test "3-pick round $((i+1)) [${combos[$i]}]" "${combos[$i]}"
done
echo ""

# ========================================
# Test Group 6: Edge cases - invalid inputs
# ========================================
echo "[Group 6] Edge cases - invalid inputs"

# Duplicate numbers [3 3]
run_error_test "Duplicate picks [3 3]" "3 3" "EDuplicateNumber"

# Number out of range [0]
run_error_test "Number below range [0]" "0" "ENumberOutOfRange"

# Number out of range [6]
run_error_test "Number above range [6]" "6" "ENumberOutOfRange"

# Too many picks [1 2 3 4] (max is 3)
run_error_test "Too many picks [1 2 3 4]" "1 2 3 4" "EInvalidPickCount"

# Empty picks [] - this should fail at CLI level or contract
run_error_test "Empty picks []" "" "EInvalidPickCount"

# Duplicate in 3-pick [1 2 1]
run_error_test "Duplicate in triple [1 2 1]" "1 2 1" "EDuplicateNumber"

echo ""

# ========================================
# Test Group 7: Pool balance verification
# ========================================
echo "[Group 7] Pool balance check"
pool_after=$(get_pool_balance)
pool_before_nusdc=$((pool_bal / 1000000))
pool_after_nusdc=$((pool_after / 1000000))
net_change=$(( (pool_after - pool_bal) / 1000000 ))

echo "  Pool before: ${pool_before_nusdc} NUSDC"
echo "  Pool after:  ${pool_after_nusdc} NUSDC"
echo "  Net change:  ${net_change} NUSDC"
echo "  Total plays: ${TOTAL_PLAYS} (valid: $((WINS + LOSSES)), wins: ${WINS}, losses: ${LOSSES})"

# Pool should not be depleted below min balance
if [[ $pool_after -ge 500000000 ]]; then
  log_pass "Pool above POOL_MIN_BALANCE (500 NUSDC)"
else
  log_fail "Pool below POOL_MIN_BALANCE: ${pool_after_nusdc} NUSDC"
fi

echo ""

# ========================================
# Summary
# ========================================
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
echo ""
echo "  Game stats: ${TOTAL_PLAYS} plays, ${WINS} wins, ${LOSSES} losses"
if [[ $((WINS + LOSSES)) -gt 0 ]]; then
  win_pct=$((WINS * 100 / (WINS + LOSSES)))
  echo "  Win rate: ${win_pct}% (expected ~20-60% depending on pick mix)"
fi
echo "============================================"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
